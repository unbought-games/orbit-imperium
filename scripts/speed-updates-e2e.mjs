// Explicit-only real CLI/API/worker/browser speed-cutover validation.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import pg from 'pg'
import { chromium, expect } from '@playwright/test'
import { reserveTestPort } from './fixtures/ports.mjs'
import { prepareProgression } from './fixtures/progression.mjs'
import { cleanupAll } from './fixtures/cleanup.mjs'

const began = performance.now()
const current = resolve(process.env.ORBIT_CURRENT_SERVER ?? 'target/debug/orbit')
const dir = mkdtempSync(join(tmpdir(), 'orbit-speed-'))
const database = `orbit_raiding_${randomBytes(6).toString('hex')}`
const universe = randomUUID(), other = randomUUID()
const password = process.env.ORBIT_DB_PASSWORD || 'orbit'
const url = `postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/${database}`
const compose = (...args) => execFileSync('docker', ['compose', ...args], { stdio: 'pipe' })
const safe = text => String(text).replaceAll(password === 'orbit' ? '\0' : password, '[redacted]')
const children = [], leases = []
let db, browser, active, auth, binding, body, at = 1000000, created = false
const env = { ...process.env, DATABASE_URL: url, ORBIT_ASSETS: resolve('apps/web/dist'), ORBIT_UNIVERSE_ID: universe, ORBIT_LOCAL_INSECURE: '1' }
for (const key of ['ORBIT_TEST_SEEDED', 'ORBIT_METRICS_BIND', 'ORBIT_SPEED', 'ORBIT_GALAXIES', 'ORBIT_SYSTEMS_PER_GALAXY', 'ORBIT_POSITIONS_PER_SYSTEM', 'ORBIT_MAX_PLAYERS', 'ORBIT_SIGNUP_ENABLED', 'ORBIT_SIGNUP_PER_MINUTE', 'ORBIT_COMMANDS_PER_MINUTE']) delete env[key]
const accounts = Array.from({ length: 3 }, (_, i) => ({ name: `speedplayer${i}`, password: randomUUID() }))
const rulesFile = join(dir, 'rules.json')
const operator = args => JSON.parse(execFileSync(current, args, { env, encoding: 'utf8', stdio: 'pipe' }))
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, name, ms = 30000) {
  const deadline = performance.now() + ms
  while (performance.now() < deadline) { const result = await fn(); if (result) return result; await pause(30) }
  throw Error(`Timed out: ${name}`)
}
async function start(role = 'api') {
  const lease = await reserveTestPort(); leases.push(lease); await lease.release()
  const base = `http://localhost:${lease.port}`
  const process = spawn(current, ['serve'], { env: { ...env, ORBIT_ROLE: role, ...(role === 'worker' ? { ORBIT_METRICS_BIND: `127.0.0.1:${lease.port}` } : {}), ORBIT_BIND: `127.0.0.1:${lease.port}`, ORBIT_ORIGIN: base }, stdio: ['ignore', 'ignore', 'pipe'] })
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
  return (await fresh()).missions.fleets.filter(f => f.intent.mission === intent.mission && f.leg === 'Outbound').sort((a, b) => b.launched_at - a.launched_at)[0]
}
function cli(action, file = rulesFile) {
  return execFileSync(current, ['rules', action, '--universe', universe, action === 'export' ? '--out' : '--file', file], { env, encoding: 'utf8', stdio: 'pipe' })
}
async function signup(account) {
  const response = await fetch(active.base + '/api/v1/registration', { method: 'POST', headers: { Origin: active.base, 'Content-Type': 'application/json' }, body: JSON.stringify(account) })
  assert.equal(response.status, 201, await response.clone().text())
}
async function savedWork() {
  const result = {}
  for (const table of ['constructions', 'research_operations', 'manufacturing_batches', 'mission_fleets'])
    result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t WHERE universe=$1 ORDER BY id`, [universe])).rows
  return result
}
async function startWork(request) {
  const quote = await options(request)
  assert.deepEqual(quote.blockers, [])
  await send({ ...request, type: { Upgrade: 'StartUpgrade', Research: 'StartResearch', Manufacture: 'StartManufacture' }[request.type], expected_terms_hash: quote.terms_hash })
  return quote
}
try {
  compose('exec', '-T', 'db', 'createdb', '-U', 'orbit', database); created = true
  execFileSync(current, ['db-init'], { env, stdio: 'pipe' })
  db = new pg.Client({ connectionString: url }); await db.connect()
  await db.query('CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); INSERT INTO orbit_test_clock VALUES(1000000)')
  const made = operator(['universe', 'create', '--universe', universe, '--commands-per-minute', '10000'])
  assert.equal(made.configuration.immutable.speed, 5)
  active = await start()
  for (const account of accounts) await signup(account)
  await stop(active)
  const players = (await db.query('SELECT p.id player,a.name FROM players p JOIN universe_memberships m ON m.player=p.id JOIN accounts a ON a.id=m.account ORDER BY a.name')).rows
  await prepareProgression(db, universe, [{ player: players[0].player, research: { ComputerTechnology: 5 }, inventory: { SmallCargo: 12 } }])
  // Separate untouched universe verifies isolation; the third starter is a quiet
  // economy observer within the changed universe, unaffected by missions/work.
  operator(['universe', 'create', '--universe', other])
  operator(['runtime', 'prepare', '--universe', universe])
  operator(['runtime', 'activate', '--universe', universe])
  let worker = await start('worker')
  active = await start()
  auth = await login(active)
  binding = (await (await fetch(`${active.base}/api/v4/universes/${universe}/binding?request_id=${randomUUID()}`, { headers: headers() })).json()).binding
  body = (await fresh()).bodies[0].id
  const initial = operator(['universe', 'show', '--universe', universe])
  const otherInitial = operator(['universe', 'show', '--universe', other])
  const idle = (await db.query('SELECT id,checkpoint_at,amounts FROM bodies WHERE owner=$1', [players[2].player])).rows[0]
  const target = (await db.query('SELECT id,galaxy,system,position FROM bodies WHERE owner=$1', [players[1].player])).rows[0]
  const destination = await world({ type: 'ResolveDestination', selection: { type: 'BodyAt', coordinates: { galaxy: target.galaxy, system: target.system, position: target.position }, kind: 'Planet' } })
  const intent = { origin: body, destination, mission: 'Transport', ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, speed_percent: 100 }
  const fast = await launch(intent)
  await advance(fast.due_at)
  const returning = (await fresh()).missions.fleets.find(f => f.id === fast.id)
  assert.equal(returning.leg, 'Returning')
  const slow = await launch({ ...intent, speed_percent: 10 })
  await advance(at + 1)
  const outbound = await launch(intent)
  const requests = [
    { type: 'Upgrade', body, building: 'MetalStorage' },
    { type: 'Research', host: body, research: 'ComputerTechnology' },
    { type: 'Manufacture', body, item: { kind: 'Ship', id: 'LightFighter' }, quantity: '3' },
    { type: 'Manufacture', body, item: { kind: 'Defense', id: 'RocketLauncher' }, quantity: '2' },
  ]
  const jobs = []
  for (const request of requests) jobs.push(await startWork(request))
  const futureRequests = [
    { type: 'Upgrade', body, building: 'MetalMine' },
    { type: 'Research', host: body, research: 'EnergyTechnology' },
    { type: 'Manufacture', body, item: { kind: 'Ship', id: 'LightFighter' }, quantity: '1' },
  ]
  const beforeQuotes = []
  for (const request of futureRequests) beforeQuotes.push(await options(request))
  const beforeFlight = await world({ type: 'FleetQuote', intent })
  const oldWork = await savedWork()
  assert.equal(oldWork.constructions.length, 1)
  assert.equal(oldWork.research_operations.length, 1)
  assert.equal(oldWork.manufacturing_batches.length, 2)
  assert.equal(oldWork.mission_fleets.length, 3)
  browser = await chromium.launch(); const page = await browser.newPage()
  const split = auth.cookie.indexOf('=')
  await page.context().addCookies([{ name: auth.cookie.slice(0, split), value: auth.cookie.slice(split + 1), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
  const slug = (await db.query('SELECT universe_name_key(name) AS slug FROM universes WHERE id=$1', [universe])).rows[0].slug
  await page.goto(`${active.base}/u/${slug}/settings`)
  await expect(page.getByLabel('Universe settings', { exact: true })).toContainText('Universe speed: 5×.')
  cli('export'); const document = JSON.parse(readFileSync(rulesFile)); document.speed = 3
  writeFileSync(rulesFile, JSON.stringify(document))
  const diff = JSON.parse(cli('diff'))
  assert.deepEqual(diff.changes, [{ path: '/speed', before: 5, after: 3 }])
  assert.deepEqual(diff.initialize, { add_buildings: [], add_research: [] })
  const cutover = performance.now()
  const applied = JSON.parse(cli('apply'))
  assert.equal(applied.status, 'Applied'); assert.equal(applied.effective_at, at)
  assert.deepEqual(await savedWork(), oldWork, 'all paid rows retain every field')
  assert.equal(JSON.parse(cli('apply')).status, 'AlreadyActive')
  const shown = operator(['universe', 'show', '--universe', universe])
  assert.equal(shown.configuration.immutable.speed, 3)
  assert.equal(shown.rules_hash, applied.profile_hash)
  assert.equal(shown.rules_revision, initial.rules_revision + 1)
  assert.deepEqual(shown.configuration.policy, initial.configuration.policy)
  assert.equal(shown.configuration.base_revision, initial.configuration.base_revision)
  assert.deepEqual(operator(['universe', 'show', '--universe', other]), otherInitial)
  // The open browser must refresh its rules/settings after the invalidation.
  await expect(page.getByLabel('Universe settings', { exact: true })).toContainText('Universe speed: 3×.')
  const checkpoint = (await db.query('SELECT checkpoint_at,amounts,carry FROM bodies WHERE id=$1', [idle.id])).rows[0]
  assert.equal(Number(checkpoint.checkpoint_at), at)
  const elapsed = BigInt(at) - BigInt(idle.checkpoint_at)
  assert.equal(BigInt(checkpoint.amounts.metal), BigInt(idle.amounts.metal) + 150_000_000n * elapsed / 3_600_000n)
  assert.equal(BigInt(checkpoint.carry.metal), 150_000_000n * elapsed % 3_600_000n)
  for (const [index, request] of futureRequests.entries()) {
    const after = await options(request), before = beforeQuotes[index]
    assert.notEqual(after.terms_hash, before.terms_hash)
    assert.deepEqual(after.terms.paid, before.terms.paid)
    const field = request.type === 'Manufacture' ? 'unit_duration_ms' : 'duration_ms'
    assert.ok(after.terms[field] > before.terms[field], `${request.type} new duration uses slower speed`)
  }
  const afterFlight = await world({ type: 'FleetQuote', intent })
  assert.notEqual(afterFlight.terms_hash, beforeFlight.terms_hash)
  assert.ok(afterFlight.duration_ms > beforeFlight.duration_ms)
  console.log(`PASS: 5× → 3× CLI activation, unchanged paid work, exact old-rate settlement, new quotes, live browser update (${Math.round(performance.now() - cutover)} ms)`)

  // Recall one old outbound mission under new rules; elapsed original travel
  // determines the return, not a re-quote at 3×.
  await advance(at + 1000)
  await send({ type: 'World', action: { type: 'RecallMission', fleet: slow.id } })
  const recalled = (await fresh()).missions.fleets.find(f => f.id === slow.id)
  assert.equal(recalled.due_at, at + (at - slow.launched_at))
  assert.equal(recalled.duration_ms, slow.duration_ms)
  // Restart both roles while the old construction, research, batches and fleets
  // are still pending, proving canonical metadata and historical rules agree.
  await browser.close(); browser = null
  await stop(active); await stop(worker)
  worker = await start('worker'); active = await start(); auth = await login(active)
  assert.equal((await fresh()).profile_hash, applied.profile_hash)
  await advance(Math.max(...jobs.map(q => q.estimates.final_due_at), returning.due_at, outbound.due_at, recalled.due_at))
  const remaining = (await fresh()).missions.fleets.filter(f => f.leg === 'Returning').map(f => f.due_at)
  if (remaining.length) await advance(Math.max(at, ...remaining))
  const completed = await fresh()
  assert.equal(completed.constructions.length, 0)
  assert.equal(completed.progression.research_operation, null)
  assert.equal(completed.progression.manufacturing.length, 0)
  for (const { row } of oldWork.mission_fleets) {
    const after = (await db.query('SELECT data FROM mission_fleets WHERE id=$1', [row.id])).rows[0].data
    assert.deepEqual(after.terms, row.data.terms)
    assert.equal(after.leg, 'Returned')
  }
  for (const table of ['research_operations', 'manufacturing_batches']) {
    for (const { row } of oldWork[table]) {
      const after = (await db.query(`SELECT data FROM ${table} WHERE id=$1`, [row.id])).rows[0].data
      assert.deepEqual(after.commitment, row.data.commitment)
      assert.equal(after.status, 'Completed')
    }
  }
  const oldBuild = oldWork.constructions[0].row
  const built = (await db.query('SELECT due_at,paid,profile_hash,status FROM constructions WHERE id=$1', [oldBuild.id])).rows[0]
  assert.equal(Number(built.due_at), oldBuild.due_at)
  assert.deepEqual(built.paid, oldBuild.paid); assert.equal(built.profile_hash, oldBuild.profile_hash)
  assert.equal(built.status, 'Completed')
  await send({ type: 'StartUpgrade', body, building: 'MetalMine', expected_terms_hash: beforeQuotes[0].terms_hash }, 'Rejected')
  // Accept and complete genuinely new work after the change.
  const newJobs = []
  for (const request of futureRequests) newJobs.push(await startWork(request))
  const newFlight = await launch(intent)
  assert.equal(newFlight.duration_ms, afterFlight.duration_ms)
  await advance(Math.max(...newJobs.map(q => q.estimates.final_due_at), newFlight.due_at))
  const returns = (await fresh()).missions.fleets.filter(f => f.leg === 'Returning').map(f => f.due_at)
  if (returns.length) await advance(Math.max(at, ...returns))
  const final = await fresh()
  assert.equal(final.constructions.length, 0); assert.equal(final.progression.research_operation, null); assert.equal(final.progression.manufacturing.length, 0)
  assert.equal(final.binding.epoch, binding.epoch)
  assert.equal(final.speed, 3)
  await signup({ name: 'speedafteractivation', password: randomUUID() })
  execFileSync(current, ['audit', '--universe', universe], { env, stdio: 'pipe' })
  assert.deepEqual(operator(['universe', 'show', '--universe', other]), otherInitial)
  console.log(`PASS: old jobs/returns/recall complete, new work completes at 3×, stale consent rejected, signup/restart/audit pass (${Math.round(performance.now() - began)} ms total)`)
} catch (error) {
  console.error(safe(error.stderr?.toString() ?? error.stack)); process.exitCode = 1
} finally {
  const cleanup = performance.now()
  await cleanupAll([
    () => browser?.close(),
    ...children.map(child => () => stop(child)),
    ...leases.map(lease => () => lease.release()),
    () => db?.end(),
    () => { if (created) compose('exec', '-T', 'db', 'dropdb', '-U', 'orbit', '--force', database) },
    () => rmSync(dir, { recursive: true, force: true }),
  ])
  console.log(`Cleanup: processes, port leases, ${database} and temporary files removed (${Math.round(performance.now() - cleanup)} ms)`)
}
