// Explicit HTTP/worker/restart journey. PostgreSQL controls the fixture clock and the
// creation draw, and supplies settlement barriers. All fleet and combat actions use HTTP.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import Ajv from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import pg from 'pg'
import { cleanupAll } from './fixtures/cleanup.mjs'
import { reserveTestPort } from './fixtures/ports.mjs'

const universe = randomUUID()
const db = 'orbit_moon_' + randomBytes(6).toString('hex')
const dbRoot =
  'postgres://orbit:' +
  encodeURIComponent(process.env.ORBIT_DB_PASSWORD || 'orbit') +
  '@127.0.0.1:' +
  (process.env.ORBIT_TEST_DB_PORT || '55432') +
  '/'
const admin = new pg.Client({ connectionString: dbRoot + 'orbit' })
const sql = new pg.Client({ connectionString: dbRoot + db })
const port = await reserveTestPort()
const base = 'http://localhost:' + port.port
const env = {
  ...process.env,
  DATABASE_URL: dbRoot + db,
  ORBIT_UNIVERSE_ID: universe,
  ORBIT_TEST_SEEDED: '1',
  ORBIT_BIND: '127.0.0.1:' + port.port,
  ORBIT_ORIGIN: base,
  ORBIT_ALLOW_INSECURE_HTTP: '1',
}
const temp = mkdtempSync(join(tmpdir(), 'orbit-moon-'))
const command = (...args) =>
  execFileSync('target/debug/orbit', args, {
    env,
    stdio: ['ignore', 'pipe', 'inherit'],
  })
let server,
  at = 1790000000000
const api = '/api/v4/universes/' + universe + '/'
const zero = { metal: '0', crystal: '0', deuterium: '0' }
const schema = JSON.parse(readFileSync('contracts/openapi.json', 'utf8'))
const ajv = new Ajv({ strict: false })
addFormats(ajv)
const checks = new Map()
function valid(type, value) {
  if (!checks.has(type))
    checks.set(
      type,
      ajv.compile({
        components: schema.components,
        $ref: '#/components/schemas/' + type,
      }),
    )
  const check = checks.get(type)
  assert.ok(check(value), JSON.stringify(check.errors))
  return value
}
async function until(label, read) {
  const end = performance.now() + 30000
  while (performance.now() < end) {
    if (server && (server.exitCode !== null || server.signalCode))
      throw Error('Server exited during ' + label)
    const value = await read()
    if (value) return value
    await wait(25)
  }
  throw Error('Timed out waiting for ' + label)
}
async function start() {
  await port.release()
  server = spawn('target/debug/orbit', ['serve'], {
    env,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  await until('server readiness', async () => {
    try {
      return (await fetch(base + '/health/ready')).ok
    } catch {
      return false
    }
  })
}
async function stop(signal = 'SIGTERM') {
  if (server && server.exitCode === null && !server.signalCode) {
    const exited = once(server, 'exit')
    server.kill(signal)
    await exited
  }
  server = undefined
  await port.hold()
}
// Kill the combined API/worker on each side of the same destruction commit.
// Expire only the interrupted claim in this disposable, frozen-clock universe.
async function crashAtDestruction(impact, moon) {
  await sql.query(
    'CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer)',
  )
  for (const [stage, exists] of [
    ['before_commit:Arrival', true],
    ['after_commit:Arrival', false],
  ]) {
    await sql.query('SELECT pg_advisory_lock(901322)')
    await sql.query("INSERT INTO orbit_test_fault VALUES($1,'pause',true,0)", [
      stage,
    ])
    if (!server) await start()
    at = impact
    await sql.query('UPDATE orbit_test_clock SET at_ms=$1', [at])
    await until(
      stage,
      async () =>
        (
          await sql.query('SELECT seen FROM orbit_test_fault WHERE stage=$1', [
            stage,
          ])
        ).rows[0].seen > 0,
    )
    assert.equal(
      (
        await sql.query(
          'SELECT EXISTS(SELECT 1 FROM bodies WHERE id=$1) AS present',
          [moon],
        )
      ).rows[0].present,
      exists,
    )
    await stop('SIGKILL')
    await sql.query('SELECT pg_advisory_unlock(901322)')
    await sql.query('DELETE FROM orbit_test_fault')
    await sql.query(
      'UPDATE execution_scopes SET lease_until=0 WHERE universe=$1 AND claim_input IS NOT NULL',
      [universe],
    )
  }
  await start()
  await advance(impact)
}

async function advance(deadline) {
  assert.ok(deadline >= at)
  at = deadline
  await sql.query('UPDATE orbit_test_clock SET at_ms=$1', [at])
  await until(
    'ordered settlements through ' + at,
    async () =>
      (
        await sql.query(
          'SELECT NOT EXISTS(SELECT 1 FROM scheduled_events WHERE universe=$1 AND at_ms<=$2 AND NOT done AND NOT cancelled) AS settled',
          [universe, at],
        )
      ).rows[0].settled,
  )
}
async function json(response) {
  const value = await response.json()
  assert.ok(response.ok, JSON.stringify(value))
  return value
}
async function login(name, password) {
  const headers = { Origin: base, 'Content-Type': 'application/json' }
  const response = await fetch(base + '/api/v1/session', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, password }),
  })
  const session = await json(response)
  headers.Cookie = response.headers.get('set-cookie').split(';')[0]
  headers['X-CSRF-Token'] = session.csrf
  const { binding } = await json(
    await fetch(base + api + 'binding?request_id=' + randomUUID(), { headers }),
  )
  const post = async (path, body) =>
    json(
      await fetch(base + api + path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
    )
  const context = () => ({ binding, request_id: randomUUID() })
  return {
    binding,
    post,
    headers,
    view: async () => valid('BoundView4', await post('overview', context())),
    world: async (query) =>
      valid(
        'BoundWorld4',
        await post('world', { context: context(), ...query }),
      ).data,
    report: async (id) =>
      valid('BoundReport4', await post('reports/' + id, context())).data
        .payload,
  }
}
async function order(player, body, action) {
  const gameplay = {
    protocol: 4,
    binding: player.binding,
    command_id: randomUUID(),
    command: { type: 'World', action },
  }
  const pair = {
    gameplay,
    presence: {
      ...gameplay,
      command_id: randomUUID(),
      command: {
        type: 'World',
        action: {
          type: 'RecordForegroundPresence',
          body,
          cause: 'GameplayGesture',
          paired_command_id: gameplay.command_id,
        },
      },
    },
  }
  await player.post('commands', pair)
  const receipt = await until(action.type, async () => {
    const r = await json(
      await fetch(
        base +
          api +
          'commands/' +
          gameplay.command_id +
          '?epoch=' +
          player.binding.epoch,
        { headers: player.headers },
      ),
    )
    return r.status !== 'Pending' && r
  })
  assert.equal(receipt.status, 'Committed', JSON.stringify(receipt))
  return pair
}
async function launch(
  player,
  origin,
  destination,
  mission,
  ships,
  cargo = zero,
) {
  const intent = {
    origin,
    destination,
    mission,
    speed_percent: 100,
    cargo,
    ships: Object.entries(ships).map(([ship_type, count]) => ({
      owner: player.binding.player,
      ship_type,
      count: String(count),
    })),
  }
  const quote = await player.world({ type: 'FleetQuote', intent })
  const pair = await order(player, origin, {
    type: 'LaunchFleet',
    intent,
    expected_terms_hash: quote.terms_hash,
  })
  const fleet = (await player.view()).missions.fleets.find(
    (f) =>
      f.launched_at === at &&
      f.intent.mission === mission &&
      f.intent.origin === origin &&
      f.intent.ships.some((s) => s.count === intent.ships[0].count),
  )
  assert.ok(fleet)
  return { fleet, quote, pair }
}
async function reportId(kind, fleet) {
  const result = await sql.query(
    "SELECT id FROM mission_reports WHERE universe=$1 AND kind=$2 AND ($3::text IS NULL OR data->>'fleet'=$3)",
    [universe, kind, fleet ?? null],
  )
  assert.equal(result.rowCount, 1, kind)
  return result.rows[0].id
}
// Set the already-supported test-only entropy override on this battle alone.
async function forceCreation(fleet, epoch) {
  const {
    rows: [{ id }],
  } = await sql.query(
    "SELECT id FROM scheduled_events WHERE event->>'fleet'=$1 AND NOT done",
    [fleet.id],
  )
  const bytes = (uuid) => Buffer.from(uuid.replaceAll('-', ''), 'hex')
  const prefix = Buffer.concat([
    Buffer.from('OI-RNG-v1\0'),
    bytes(universe),
    bytes(epoch),
    bytes(id),
    Buffer.from([0, 11]),
    Buffer.from('moon-create'),
  ])
  for (let counter = 0; ; counter++) {
    const secret = Buffer.alloc(32)
    secret.writeUInt32BE(counter)
    const key = createHmac('sha256', secret).update(prefix).digest()
    const sample = createHmac('sha256', key)
      .update(Buffer.concat([Buffer.from('block\0'), Buffer.alloc(8)]))
      .digest()[0]
    if (sample < 20) {
      await sql.query('INSERT INTO orbit_test_random VALUES ($1,$2)', [
        id,
        secret,
      ])
      return
    }
  }
}

try {
  await admin.connect()
  await admin.query('CREATE DATABASE ' + db)
  await sql.connect()
  command('db-init')
  await sql.query(
    'CREATE TABLE orbit_test_clock(at_ms bigint NOT NULL); CREATE TABLE orbit_test_random(input_id uuid PRIMARY KEY, secret bytea NOT NULL)',
  )
  await sql.query('INSERT INTO orbit_test_clock VALUES ($1)', [at])
  const password = randomUUID()
  const edits = []
  for (const [name, position, dreadnoughts] of [
    ['attacker', 8, 402],
    ['defender', 9, 200],
  ]) {
    const planet = '1:1:' + position
    edits.push(
      { op: 'add-player', user: name, password, planet },
      {
        op: 'set',
        user: name,
        research: { ComputerTechnology: 8, HyperspaceDrive: 7 },
      },
      {
        op: 'set',
        user: name,
        planet,
        ships: { Dreadnought: dreadnoughts, SmallCargo: 3 },
        resources: { metal: 50000, crystal: 50000, deuterium: 1000000 },
      },
    )
  }
  const file = join(temp, 'scenario.json')
  writeFileSync(file, JSON.stringify({ version: 1, edits }), { mode: 0o600 })
  command('world', 'scenario', 'load', file, '--universe', universe)
  command('rules', 'upgrade', '--universe', universe)
  command('runtime', 'prepare', '--universe', universe)
  command('runtime', 'activate', '--universe', universe)
  await start()
  const attacker = await login('attacker', password),
    defender = await login('defender', password)
  const a = (await attacker.view()).bodies[0],
    b = (await defender.view()).bodies[0]
  const dest = (body, owner, kind = 'Planet') => ({
    type: 'Body',
    id: body,
    expected_owner: owner.binding.player,
    expected_kind: kind,
  })
  const shot = await launch(attacker, a.id, dest(b.id, defender), 'Attack', {
    Dreadnought: 1,
  })
  await forceCreation(shot.fleet, attacker.binding.epoch)
  // Evacuate the supply ship before battle; random target selection cannot
  // destroy a prerequisite for the subsequent deployment.
  await advance(shot.fleet.due_at - 1)
  const evacuation = await launch(
    defender,
    b.id,
    dest(a.id, attacker),
    'Transport',
    { SmallCargo: 1 },
  )
  await advance(shot.fleet.due_at)
  const created = await defender.report(await reportId('MoonCreated'))
  const moon = dest(created.body, defender, 'Moon')
  assert.equal(created.parent, b.id)
  const debrisBefore = (
    await attacker.world({ type: 'Galaxy', galaxy: 1, system: 1 })
  ).positions.find((p) => p.moon?.id === moon.id).debris
  assert.ok(BigInt(debrisBefore.metal) > 0n)
  // Supply the moon using real deployment; the cargo ship will be in space at impact.
  await advance(evacuation.fleet.due_at + evacuation.fleet.duration_ms)
  const local = await launch(
    defender,
    b.id,
    moon,
    'Deploy',
    { SmallCargo: 1 },
    { ...zero, metal: '500000000', deuterium: '4000000000' },
  )
  await advance(local.fleet.due_at)
  const wave = await launch(attacker, a.id, moon, 'DestroyMoon', {
    Dreadnought: 400,
  })
  assert.equal(wave.quote.moon_destruction.diameter_km, created.diameter_km)
  assert.equal(wave.quote.moon_destruction.moon_chance_ppm, 1000000)
  assert.ok(
    (await defender.view()).missions.incoming.some(
      (f) => f.mission === 'DestroyMoon' && f.target === moon.id,
    ),
  )
  // Launch the second wave one millisecond later, then arrange a recalled flight
  // and a foreign delivery that both cross the destruction deadline.
  await advance(at + 1)
  const next = await launch(attacker, a.id, moon, 'DestroyMoon', {
    Dreadnought: 1,
  })
  const impact = wave.fleet.due_at
  await advance(impact - 3000)
  const recalled = await launch(
    defender,
    moon.id,
    dest(b.id, defender),
    'Transport',
    { SmallCargo: 1 },
    { ...zero, metal: '111000000' },
  )
  const delivery = await launch(
    attacker,
    a.id,
    moon,
    'Transport',
    { SmallCargo: 1 },
    { ...zero, crystal: '123000000' },
  )
  await advance(impact - 1000)
  await order(defender, moon.id, {
    type: 'RecallMission',
    fleet: recalled.fleet.id,
  })
  const returnDue = (await defender.view()).missions.fleets.find(
    (f) => f.id === recalled.fleet.id,
  ).due_at
  assert.ok(returnDue > impact)
  await crashAtDestruction(impact, moon.id)
  const battleId = await reportId('Combat', wave.fleet.id)
  const combat = await attacker.report(battleId)
  assert.equal(combat.moon_destruction.moon_destroyed, true)
  assert.equal(combat.moon_destruction.surviving_dreadnoughts, '400')
  const lost = await defender.report(await reportId('MoonDestroyed'))
  assert.equal(lost.body, moon.id)
  const world = await defender.view()
  assert.deepEqual(world.destroyed_moons, [{ moon: moon.id, parent: b.id }])
  assert.ok(!world.bodies.some((v) => v.id === moon.id))
  const abandonment = await defender.world({
    type: 'AbandonmentQuote',
    body: b.id,
  })
  assert.ok(
    abandonment.blockers.some((reason) =>
      reason.includes('after losing its lunar destination'),
    ),
  )
  assert.ok(!world.missions.incoming.some((f) => f.target === moon.id))
  const returning = world.missions.fleets.find(
    (f) => f.id === recalled.fleet.id,
  )
  assert.equal(returning.intent.origin, b.id)
  assert.equal(returning.due_at, returnDue)
  assert.equal(returning.cargo.metal, '111000000')
  const friendly = (await attacker.view()).missions.fleets.find(
    (f) => f.id === delivery.fleet.id,
  )
  assert.equal(friendly.intent.destination.id, b.id)
  assert.equal(friendly.due_at, delivery.fleet.due_at)
  const second = (await attacker.view()).missions.fleets.find(
    (f) => f.id === next.fleet.id,
  )
  assert.equal(second.intent.destination.id, moon.id)
  assert.equal(
    (await attacker.report(await reportId('MoonTargetLost', next.fleet.id)))
      .due_at,
    second.due_at,
  )
  assert.equal(
    (
      await attacker.report(
        await reportId('MoonFleetRedirected', delivery.fleet.id),
      )
    ).destination_redirected,
    true,
  )
  const galaxy = (
    await attacker.world({ type: 'Galaxy', galaxy: 1, system: 1 })
  ).positions.find((p) => p.body?.id === b.id)
  assert.ok(!galaxy.moon)
  assert.deepEqual(galaxy.debris, debrisBefore)
  await advance(next.fleet.due_at)
  const missed = (await attacker.view()).missions.fleets.find(
    (f) => f.id === next.fleet.id,
  )
  assert.equal(missed.leg, 'Returning')
  assert.equal(missed.due_at, next.fleet.due_at + next.fleet.duration_ms)
  await advance(returnDue)
  const home = await defender.report(
    await reportId('Returned', recalled.fleet.id),
  )
  assert.equal(home.origin, b.id)
  assert.equal(home.cargo.metal, '111000000')
  await advance(delivery.fleet.due_at)
  const delivered = await defender.report(
    await reportId('Delivered', delivery.fleet.id),
  )
  assert.equal(delivered.target_kind ?? 'Planet', 'Planet')
  assert.equal(delivered.cargo.crystal, '123000000')
  const last = Math.max(
    missed.due_at,
    wave.fleet.due_at + wave.fleet.duration_ms,
    delivery.fleet.due_at + delivery.fleet.duration_ms,
  )
  await advance(last)
  const finalView = await attacker.view()
  assert.equal(finalView.missions.fleets.length, 0)
  assert.equal(
    finalView.bodies
      .find((v) => v.id === a.id)
      .inventories.find((v) => v.item.id === 'Dreadnought').count,
    combat.moon_destruction.fleet_lost ? '1' : '401',
  )
  assert.equal((await defender.view()).missions.fleets.length, 0)
  const replay = await attacker.post('commands', wave.pair)
  assert.equal(replay.status, 'Committed')
  assert.deepEqual(
    await attacker.report(await reportId('Combat', wave.fleet.id)),
    combat,
  )
  command('audit', '--universe', universe)
  console.log(
    'PASS: HTTP moon creation, deployment, quotes, two waves, scoped settlement, restart, redirects, ship and cargo returns, historical reports and audit.',
  )
} finally {
  await cleanupAll([
    stop,
    () => port.release(),
    () => sql.end(),
    () => admin.query('DROP DATABASE IF EXISTS ' + db + ' WITH (FORCE)'),
    () => admin.end(),
    () => rmSync(temp, { recursive: true, force: true }),
  ])
}
