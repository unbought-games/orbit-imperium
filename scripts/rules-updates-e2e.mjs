// Actual old/new binaries, isolated PostgreSQL, real HTTP actions and browser refresh.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import pg from 'pg'
import { chromium, expect } from '@playwright/test'
import { reserveTestPort } from './fixtures/ports.mjs'
import { prepareProgression } from './fixtures/progression.mjs'

// The configuration-aware bridge and final artifact must be distinct builds.
const previous = resolve(process.env.ORBIT_PREVIOUS_SERVER ?? 'target/rules-previous/debug/orbit')
const current = resolve(process.env.ORBIT_CURRENT_SERVER ?? 'target/debug/orbit')
assert.notEqual(createHash('sha256').update(readFileSync(previous)).digest('hex'), createHash('sha256').update(readFileSync(current)).digest('hex'), 'acceptance requires different server builds')
const dir = mkdtempSync(join(tmpdir(), 'orbit-rules-'))
const database = `orbit_raiding_${randomBytes(6).toString('hex')}`
const universe = randomUUID(), other = randomUUID()
const password = process.env.ORBIT_DB_PASSWORD || 'orbit'
const url = `postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/${database}`
const compose = (...args) => execFileSync('docker', ['compose', ...args], { stdio: 'pipe' })
const safe = text => String(text).replaceAll(password === 'orbit' ? '\0' : password, '[redacted]')
const children = [], leases = []
let db, browser, active, auth, binding, body, at = 1000000
const env = { ...process.env, DATABASE_URL: url, ORBIT_ASSETS: resolve('apps/web/dist'), ORBIT_UNIVERSE_ID: universe, ORBIT_LOCAL_INSECURE: '1' }
delete env.ORBIT_TEST_SEEDED
for (const key of ['ORBIT_SPEED', 'ORBIT_GALAXIES', 'ORBIT_SYSTEMS_PER_GALAXY', 'ORBIT_POSITIONS_PER_SYSTEM', 'ORBIT_MAX_PLAYERS', 'ORBIT_SIGNUP_ENABLED', 'ORBIT_SIGNUP_PER_MINUTE', 'ORBIT_COMMANDS_PER_MINUTE']) delete env[key]
const accounts = Array.from({ length: 5 }, (_, i) => ({ name: `rulesplayer${i}`, password: randomUUID() }))
const accountsFile = join(dir, 'accounts.json'), seedFile = join(dir, 'seed'), rulesFile = join(dir, 'rules.json')
writeFileSync(accountsFile, JSON.stringify(accounts), { mode: 0o600 }); writeFileSync(seedFile, randomBytes(32), { mode: 0o600 })
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, name, ms = 30000) {
  const deadline = performance.now() + ms
  while (performance.now() < deadline) { const result = await fn(); if (result) return result; await pause(30) }
  throw Error(`Timed out: ${name}`)
}
async function start(binary, selected = universe) {
  const lease = await reserveTestPort(); leases.push(lease); await lease.release()
  const base = `http://localhost:${lease.port}`
  const process = spawn(binary, ['serve'], { env: { ...env, ORBIT_UNIVERSE_ID: selected, ORBIT_BIND: `127.0.0.1:${lease.port}`, ORBIT_ORIGIN: base }, stdio: ['ignore', 'ignore', 'pipe'] })
  const node = { process, base, error: '', exited: false }
  process.stderr.on('data', data => { node.error += safe(data) })
  node.done = new Promise(resolve => process.once('exit', () => { node.exited = true; resolve() }))
  children.push(node)
  await until(async () => { if (node.exited) throw Error(node.error); try { return (await fetch(base + '/health/ready')).ok } catch { return false } }, 'readiness')
  return node
}
async function stop(node, signal = 'SIGINT') { if (!node.exited) node.process.kill(signal); await node.done }
async function login(node, account = accounts[0]) {
  const response = await fetch(node.base + '/api/v1/session', { method: 'POST', headers: { Origin: node.base, 'Content-Type': 'application/json' }, body: JSON.stringify(account) })
  assert.equal(response.status, 200)
  return { session: await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] }
}
const headers = () => ({ Origin: active.base, 'Content-Type': 'application/json', Cookie: auth.cookie, 'X-CSRF-Token': auth.session.csrf })
const context = () => ({ binding, request_id: randomUUID() })
async function post(path, data) {
  return fetch(`${active.base}/api/v4/universes/${universe}/${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(data) })
}
async function fresh() {
  const response = await post('overview', context())
  assert.equal(response.status, 200, 'committed views must succeed during ordinary catch-up')
  return response.json()
}
async function advance(time) {
  assert.ok(time >= at); at = time; await db.query('UPDATE orbit_test_clock SET at_ms=$1', [at])
  // The fixture waits for an outcome explicitly; HTTP success no longer implies catch-up.
  await until(async () => (await db.query('SELECT count(*)::int AS pending FROM pending_inputs WHERE universe=$1 AND at_ms<=$2', [universe, at])).rows[0].pending === 0, 'due work settles')
  return fresh()
}
async function send(command, expected = 'Committed') {
  const gameplay = { protocol: 4, binding, command_id: randomUUID(), command }
  const pair = { gameplay, presence: { protocol: 4, binding, command_id: randomUUID(), command: { type: 'World', action: { type: 'RecordForegroundPresence', body, cause: 'GameplayGesture', paired_command_id: gameplay.command_id } } } }
  const response = await post('commands', pair); assert.equal(response.status, 202, await response.clone().text())
  const receipt = await until(async () => { const r = await fetch(`${active.base}/api/v4/universes/${universe}/commands/${gameplay.command_id}?epoch=${binding.epoch}`, { headers: headers() }); assert.equal(r.status, 200); const x = await r.json(); return x.status !== 'Pending' && x }, 'command receipt')
  assert.equal(receipt.status, expected, JSON.stringify(receipt)); return pair
}
async function options(request) { const r = await post('progression-options', { context: context(), request }); assert.equal(r.status, 200); return r.json() }
async function world(query) { const r = await post('world', { context: context(), ...query }); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).data }
async function launch(intent) {
  const terms = await world({ type: 'FleetQuote', intent })
  await send({ type: 'World', action: { type: 'LaunchFleet', intent, expected_terms_hash: terms.terms_hash } })
  return (await fresh()).missions.fleets.find(f => f.intent.mission === intent.mission && f.leg === 'Outbound')
}
function cli(action, file = rulesFile) {
  return execFileSync(current, ['rules', action, '--universe', universe, action === 'export' ? '--out' : '--file', file], { env, encoding: 'utf8', stdio: 'pipe' })
}
try {
  compose('exec', '-T', 'db', 'createdb', '-U', 'orbit', database)
  execFileSync(previous, ['mvp-raids-bootstrap', '--universe', universe, '--at', String(at)], { env: { ...env, ORBIT_MVP_ACCOUNTS_FILE: accountsFile, ORBIT_MVP_SEED_FILE: seedFile }, stdio: 'pipe' })
  const policyFile = join(dir, 'policy.json')
  const imported = JSON.parse(execFileSync(previous, ['universe', 'config', 'import-env', '--universe', universe, '--out', policyFile], {
    env: { ...env, ORBIT_SIGNUP_ENABLED: 'true', ORBIT_MAX_PLAYERS: '45', ORBIT_SIGNUP_PER_MINUTE: '5', ORBIT_COMMANDS_PER_MINUTE: '10000' }, encoding: 'utf8', stdio: 'pipe',
  }))
  assert.equal(imported.status, 'review_required')
  const policy = JSON.parse(readFileSync(policyFile))
  assert.equal(policy.immutable.speed, 10, 'bridge import must retain historical fixture speed')
  assert.equal(policy.immutable.systems_per_galaxy, 5)
  assert.deepEqual(policy.policy, { signup_enabled: true, max_players: 45, signup_per_minute: 5, commands_per_minute: 10000 })
  execFileSync(previous, ['universe', 'config', 'initialize', '--universe', universe, '--file', policyFile, '--acknowledge-bridge-rollout'], { env, stdio: 'pipe' })
  db = new pg.Client({ connectionString: url }); await db.connect()
  await db.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)')
  assert.equal((await db.query("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='universe_runtime' AND column_name='executor_mode') AS bridge")).rows[0].bridge, true, 'ORBIT_PREVIOUS_SERVER must retain the durable runtime bridge')
  // API bindings now require existing worlds; this independent world retains the new default.
  const otherCreated = JSON.parse(execFileSync(current, ['universe', 'create', '--universe', other], { env, encoding: 'utf8', stdio: 'pipe' }))
  assert.equal(otherCreated.configuration.immutable.speed, 5)
  const players = (await db.query('SELECT p.id player,a.name FROM players p JOIN universe_memberships m ON m.player=p.id JOIN accounts a ON a.id=m.account ORDER BY a.name')).rows
  await prepareProgression(db, universe, players.slice(0, 2).map(p => ({ player: p.player, research: { ComputerTechnology: 5 }, inventory: { SmallCargo: 10, LightFighter: 100 } })))
  let old = await start(previous); active = old; auth = await login(active)
  binding = (await (await fetch(`${active.base}/api/v4/universes/${universe}/binding?request_id=${randomUUID()}`, { headers: headers() })).json()).binding
  body = (await fresh()).bodies[0].id
  const initial = (await db.query('SELECT id,epoch,profile_hash FROM universes WHERE id=$1', [universe])).rows[0]
  let modern = await start(current)
  await advance(at + 14 * 86400000)
  assert.equal((await fresh()).catalog.find(e => e.key.id === 'LargeCargo').enabled, false)
  await stop(modern); modern = await start(current)
  await stop(old); old = await start(previous); active = old
  assert.deepEqual((await db.query('SELECT id,epoch,profile_hash FROM universes WHERE id=$1', [universe])).rows[0], initial)
  const pending = await options({ type: 'Upgrade', body, building: 'MetalStorage' })
  await send({ type: 'StartUpgrade', body, building: 'MetalStorage', expected_terms_hash: pending.terms_hash })
  // Preparation and activation happen with both compatible processes alive.
  execFileSync(previous, ['runtime', 'prepare', '--universe', universe], { env, stdio:'pipe' })
  execFileSync(current, ['runtime', 'activate', '--universe', universe], { env, stdio:'pipe' })
  assert.equal((await db.query('SELECT executor_mode FROM universe_runtime WHERE universe=$1',[universe])).rows[0].executor_mode,'scoped')
  assert.equal((await fresh()).binding.epoch,initial.epoch)
  console.log('PASS: compatible releases overlap/restart and retained serial work crosses a fenced scoped cutover')
  await stop(old); active = modern
  let peer = await start(current, other)
  const otherHash = (await db.query('SELECT profile_hash FROM universes WHERE id=$1', [other])).rows[0].profile_hash
  // Finish the old-build job, then establish a return leg that crosses activation.
  await advance(pending.estimates.final_due_at)
  const target = (await db.query('SELECT id,owner,galaxy,system,position FROM bodies WHERE owner=$1', [players[1].player])).rows[0]
  const destination = await world({ type: 'ResolveDestination', selection: { type: 'BodyAt', coordinates: { galaxy: target.galaxy, system: target.system, position: target.position }, kind: 'Planet' } })
  const empty = { metal: '0', crystal: '0', deuterium: '0' }
  const intent = { origin: body, destination, mission: 'Transport', ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '1' }], cargo: empty, speed_percent: 10 }
  const transport = await launch(intent); await advance(transport.due_at)
  const returning = (await fresh()).missions.fleets.find(f => f.id === transport.id)
  assert.equal(returning.leg, 'Returning')
  const attack = await launch({ ...intent, mission: 'Attack', speed_percent: 100, ships: [{ owner: binding.player, ship_type: 'LightFighter', count: '80' }, { owner: binding.player, ship_type: 'SmallCargo', count: '4' }] })
  const work = []
  for (const request of [{ type: 'Upgrade', body, building: 'CrystalStorage' }, { type: 'Research', host: body, research: 'ComputerTechnology' }, { type: 'Manufacture', body, item: { kind: 'Ship', id: 'LightFighter' }, quantity: '3' }]) {
    const quote = await options(request); assert.deepEqual(quote.blockers, [])
    await send({ ...request, type: { Upgrade: 'StartUpgrade', Research: 'StartResearch', Manufacture: 'StartManufacture' }[request.type], expected_terms_hash: quote.terms_hash }); work.push(quote.estimates.final_due_at)
  }
  const stale = await options({ type: 'Upgrade', body, building: 'MetalMine' })
  const oldCommitments = (await db.query('SELECT id,data FROM mission_fleets WHERE universe=$1 ORDER BY id', [universe])).rows
  browser = await chromium.launch(); const page = await browser.newPage()
  const split = auth.cookie.indexOf('=')
  await page.context().addCookies([{ name: auth.cookie.slice(0, split), value: auth.cookie.slice(split + 1), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
  await page.goto(`${active.base}/u/${universe}/research`)
  await expect(page.getByRole('button', { name: 'Research Laser Technology', exact: true })).toBeDisabled()
  cli('export'); const document = JSON.parse(readFileSync(rulesFile))
  document.artifact = JSON.parse(readFileSync('scripts/fixtures/rules-expanded.json'))
  document.artifact.world.combat.max_rounds = 1
  writeFileSync(rulesFile, JSON.stringify(document))
  assert.equal(JSON.parse(cli('diff')).initialize.add_research[0], 'LaserTechnology')
  // Pause the owner (operator or worker) after writes but before publication.
  await db.query("CREATE FUNCTION pause_rule_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(901325); RETURN NEW; END $$; CREATE TRIGGER pause_rule_activation BEFORE INSERT ON rules_activations FOR EACH ROW EXECUTE FUNCTION pause_rule_activation();")
  await db.query('SELECT pg_advisory_lock(901325)')
  const updater = { process: spawn(current, ['rules', 'apply', '--universe', universe, '--file', rulesFile], { env, stdio: 'ignore' }), exited: false }
  updater.done = new Promise(resolve => updater.process.once('exit', () => { updater.exited = true; resolve() }))
  children.push(updater)
  await until(async () => (await db.query("SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND l.objid=901325 AND NOT l.granted) AS waiting")).rows[0].waiting, 'activation before commit')
  // API reads/admission continue while configuration effects are staged.
  assert.equal((await fresh()).profile_hash, initial.profile_hash)
  const duringActivation={protocol:4,binding,command_id:randomUUID(),command:{type:'World',action:{type:'RecordForegroundPresence',body:null,cause:'AccountVisit',paired_command_id:null}}}
  assert.equal((await post('presence',duringActivation)).status,202)
  // Any current worker may own the durable activation; kill all executing
  // attempts before releasing the database fault, keeping the queued boundary.
  await stop(updater,'SIGKILL'); await stop(modern,'SIGKILL'); await stop(peer,'SIGKILL')
  assert.equal((await db.query('SELECT profile_hash FROM universes WHERE id=$1',[universe])).rows[0].profile_hash,initial.profile_hash)
  assert.equal((await db.query('SELECT count(*)::int AS n FROM runtime_barriers WHERE universe=$1 AND NOT done',[universe])).rows[0].n,1)
  await db.query('SELECT pg_advisory_unlock(901325)')
  await db.query('DROP TRIGGER pause_rule_activation ON rules_activations; DROP FUNCTION pause_rule_activation()')
  assert.equal((await db.query('SELECT count(*) FROM rules_activations WHERE universe=$1', [universe])).rows[0].count, '0')
  assert.equal((await db.query("SELECT count(*) FROM research_levels WHERE owner=$1 AND research='LaserTechnology'", [binding.player])).rows[0].count, '0')
  console.log('PASS: killed activation attempts roll back effects while retaining the durable boundary and accepted later order')
  modern=await start(current); active=modern; peer=await start(current,other)
  const applied = JSON.parse(cli('apply')); assert.ok(['Applied','AlreadyActive'].includes(applied.status))
  await until(async()=>{
    const response=await fetch(`${active.base}/api/v4/universes/${universe}/commands/${duringActivation.command_id}?epoch=${binding.epoch}`,{headers:headers()})
    assert.equal(response.status,200)
    return (await response.json()).status==='Committed'
  },'accepted order after recovered rules boundary')
  assert.equal(JSON.parse(cli('apply')).status, 'AlreadyActive')
  assert.equal((await db.query('SELECT profile_hash FROM universes WHERE id=$1', [other])).rows[0].profile_hash, otherHash)
  for (const node of [modern, peer]) { active = node; assert.equal((await fresh()).profile_hash, applied.profile_hash) }
  active = modern
  const newCommitments = (await db.query('SELECT id,data FROM mission_fleets WHERE universe=$1 ORDER BY id', [universe])).rows
  assert.deepEqual(newCommitments, oldCommitments)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Research Laser Technology', exact: true })).toBeEnabled()
  await page.goto(`${active.base}/u/${universe}/b/${body}/shipyard`)
  await expect(page.getByRole('button', { name: 'Build Large Cargo', exact: true })).toBeEnabled()
  console.log('PASS: atomic activation across new instances, old commitments retained, per-universe isolation, browser refresh exposes content')
  await advance(Math.max(...work, attack.due_at, returning.due_at))
  const combat = (await db.query("SELECT data FROM mission_reports WHERE universe=$1 AND data->>'fleet'=$2 AND kind='Combat'", [universe, attack.id])).rows[0].data
  assert.equal(combat.rules_hash, applied.profile_hash)
  const defenderReport = combat.payloads[players[1].player]
  assert.equal(defenderReport.rounds.length, 1, 'active one-round combat policy applies to an old flight')
  const lastReturn = (await fresh()).missions.fleets.filter(f => f.leg === 'Returning').map(f => f.due_at)
  if (lastReturn.length) await advance(Math.max(at, ...lastReturn))
  const completed = await fresh()
  assert.equal(completed.constructions.length, 0); assert.equal(completed.progression.research_operation, null); assert.equal(completed.progression.manufacturing.length, 0)
  await send({ type: 'StartUpgrade', body, building: 'MetalMine', expected_terms_hash: stale.terms_hash }, 'Rejected')
  for (const request of [{ type: 'Research', host: body, research: 'LaserTechnology' }, { type: 'Manufacture', body, item: { kind: 'Ship', id: 'LargeCargo' }, quantity: '1' }]) {
    const quote = await options(request); assert.deepEqual(quote.blockers, [])
    await send({ ...request, type: request.type === 'Research' ? 'StartResearch' : 'StartManufacture', expected_terms_hash: quote.terms_hash }); await advance(quote.estimates.final_due_at)
  }
  const earned = await fresh(); assert.equal(earned.research.find(r => r.research === 'LaserTechnology').level, 1)
  assert.equal(earned.bodies[0].inventories.find(i => i.item.id === 'LargeCargo').count, '1')
  await page.goto(`${active.base}/u/${universe}/dispatch?body=${body}`)
  await expect(page.getByRole('button', { name: 'All Large Cargo', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'All Large Cargo', exact: true }).click()
  await page.getByLabel('System', { exact: true }).fill(String(target.system))
  await page.getByLabel('Position', { exact: true }).fill(String(target.position))
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review dispatch', exact: true })).toBeVisible()
  await browser.close(); browser = null
  const registration = await fetch(active.base + '/api/v1/registration', { method: 'POST', headers: { Origin: active.base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'newafteractivation', password: 'password' }) })
  assert.equal(registration.status, 201)
  await stop(modern, 'SIGKILL'); active = await start(current)
  assert.equal((await fresh()).profile_hash, applied.profile_hash)
  assert.equal(binding.epoch, initial.epoch)
  assert.equal((await db.query('SELECT count(*) FROM rules_activations WHERE universe=$1', [universe])).rows[0].count, '1')
  console.log('PASS: old jobs/returns complete, arrival combat uses active rules, stale quote rejects, new research/ship earned, signup and restart retain world')
} catch (error) {
  console.error(safe(error.stderr?.toString() ?? error.stack)); process.exitCode = 1
} finally {
  await browser?.close()
  for (const child of children) await stop(child)
  for (const lease of leases) await lease.release()
  await db?.end()
  compose('exec', '-T', 'db', 'dropdb', '-U', 'orbit', '--force', database)
  rmSync(dir, { recursive: true, force: true })
}
