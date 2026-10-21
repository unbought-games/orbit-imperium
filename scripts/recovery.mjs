// Explicit-only process recovery. Uses the generous named recovery guard.
import { cleanupAll } from './fixtures/cleanup.mjs'
import { reserveTestPort } from './fixtures/ports.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import assert from 'node:assert/strict'
import pg from 'pg'

mkdirSync('.secrets', { recursive: true, mode: 0o700 })
const apiLease = await reserveTestPort(process.env.ORBIT_TEST_RECOVERY_PORT)
const peerLease = await reserveTestPort(process.env.ORBIT_TEST_RECOVERY_PEER_PORT)
const workerLease = await reserveTestPort()
const peerWorkerLease = await reserveTestPort()
const base = `http://localhost:${apiLease.port}`, peerBase = `http://localhost:${peerLease.port}`
const password = process.env.ORBIT_DB_PASSWORD || 'orbit'
const admin = new pg.Client({ connectionString: `postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/orbit` })
await admin.connect()
async function until(fn, label) {
  for (let i = 0; i < 300; i++) {
    const value = await fn()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw Error(`Timed out: ${label}`)
}
async function nextUpdate(stream) {
  for (;;) {
    const end = stream.buffer.indexOf('\n\n')
    if (end >= 0) {
      const frame = stream.buffer.slice(0, end)
      stream.buffer = stream.buffer.slice(end + 2)
      const data = frame.split('\n').find(line => line.startsWith('data:'))
      if (data) return JSON.parse(data.slice(5).trim())
      continue
    }
    const chunk = await stream.reader.read()
    assert.equal(chunk.done, false, 'update stream ended before its expected event')
    stream.buffer += stream.decoder.decode(chunk.value, { stream: true })
    assert.ok(stream.buffer.length <= 256 * 1024, 'bounded update frame')
  }
}
async function scenario(crashIndex = null, stage = null, overlap = false) {
  const began = performance.now(); let preparedAt, cleanupAt
  const database = `orbit_recovery_${randomBytes(6).toString('hex')}`, universe = randomUUID()
  const passwords = [randomUUID(), randomUUID()]
  const secret = `${process.env.ORBIT_TEST_SECRET_DIR ?? '.secrets'}/${database}`
  let api, peer, worker, peerWorker, db, stream, replay
  const stop = async (process, lease, signal = 'SIGINT') => {
    if (!process) return
    if (process.pid && process.exitCode === null && process.signalCode === null) {
      process.kill(signal)
      await new Promise(resolve => process.once('exit', resolve))
    }
    await lease.hold()
  }
  try {
    await admin.query(`CREATE DATABASE ${database}`)
    writeFileSync(secret, passwords.join('\n'), { mode: 0o600 })
    const url = `postgres://orbit:${encodeURIComponent(password)}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/${database}`
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('ORBIT_')))
    const env = { ...inherited, DATABASE_URL: url, ORBIT_SPEED: '1', ORBIT_TEST_SEEDED: '1', ORBIT_ORIGIN: base, ORBIT_LOCAL_INSECURE: '1', ORBIT_SEED_PASSWORD_FILE: secret, ORBIT_DRAIN_MS: '1000', ORBIT_POOL_CONTROL: '4' }
    delete env.ORBIT_METRICS_BIND
    const cli = args => execFileSync('target/debug/orbit', args, { env, stdio: 'pipe' })
    cli(['dev-seed', '--universe', universe, '--at', '1000000'])
    db = new pg.Client({ connectionString: url }); await db.connect()
    await db.query('CREATE TABLE orbit_test_clock(at_ms bigint); INSERT INTO orbit_test_clock VALUES(1000000); CREATE TABLE orbit_test_fault(stage text PRIMARY KEY,mode text,enabled boolean,seen integer)')
    cli(['runtime', 'prepare', '--universe', universe])
    cli(['runtime', 'activate', '--universe', universe])
    assert.equal((await db.query('SELECT executor_mode FROM universe_runtime')).rows[0].executor_mode, 'scoped')
    const start = async (role, lease) => {
      await lease.release()
      const settings = role === 'api'
        ? { ORBIT_BIND: `127.0.0.1:${lease.port}`, ORBIT_POOL_ADMISSION: '4', ORBIT_POOL_READS: '4', ORBIT_POOL_WORKER: '0' }
        : { ORBIT_METRICS_BIND: `127.0.0.1:${lease.port}`, ORBIT_POOL_ADMISSION: '0', ORBIT_POOL_READS: '0', ORBIT_POOL_WORKER: '4', ORBIT_CPU_WORKERS: '2', ORBIT_MAX_IN_FLIGHT: '4' }
      const process = spawn('target/debug/orbit', ['serve'], { env: { ...env, ...settings, ORBIT_ROLE: role }, stdio: 'ignore' })
      // Retain each owned child before readiness so failed startup is cleaned too.
      if (lease === apiLease) api = process
      else if (lease === peerLease) peer = process
      else if (lease === workerLease) worker = process
      else peerWorker = process
      let startupError
      process.once('error', error => { startupError = error })
      await until(async () => {
        if (startupError) throw startupError
        assert.equal(process.exitCode, null, `${role} exited during preparation`)
        assert.equal(process.signalCode, null, `${role} was killed during preparation`)
        try { return (await fetch(`http://localhost:${lease.port}/health/ready`)).ok } catch { return false }
      }, `${role} readiness`)
      return process
    }
    // Roles have independent ports/pools; await every startup before proceeding.
    const starts = await Promise.allSettled([
      start('api', apiLease), start('worker', workerLease),
      ...(overlap ? [start('api', peerLease), start('worker', peerWorkerLease)] : []),
    ])
    for (const result of starts) if (result.status === 'rejected') throw result.reason
    const login = async (name, password) => {
      const response = await fetch(base + '/api/v1/session', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, password }) })
      assert.equal(response.status, 200)
      const session = await response.json()
      return { session, headers: { Origin: base, 'Content-Type': 'application/json', Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrf } }
    }
    const [a, b] = await Promise.all([login('alpha', passwords[0]), login('beta', passwords[1])])
    preparedAt = performance.now()
    const getView = async (auth, endpoint = base) => {
      const discovery = await fetch(`${endpoint}/api/v2/universes/${universe}/binding?request_id=${randomUUID()}`, { headers: auth.headers })
      assert.equal(discovery.status, 200)
      const candidate = await discovery.json()
      const response = await fetch(`${endpoint}/api/v2/universes/${universe}/overview`, { method: 'POST', headers: auth.headers, body: JSON.stringify({ binding: candidate.binding, request_id: randomUUID() }) })
      assert.equal(response.status, 200, 'committed snapshots must not return backlog failures')
      return response.json()
    }
    let view = await getView(a)
    const beta = await getView(b), target = beta.bodies[0].id, origin = view.bodies[0].id
    let lastEnvelope, extra = 0, resetCursor
    const openStream = async (endpoint, after) => {
      const response = await fetch(`${endpoint}/api/v4/universes/${universe}/updates?epoch=${view.binding.epoch}`, { headers: { ...a.headers, ...(after ? { 'Last-Event-ID': after } : {}) } })
      assert.equal(response.status, 200)
      return { reader: response.body.getReader(), buffer: '', decoder: new TextDecoder() }
    }
    if (overlap) { stream = await openStream(base); const reset = await nextUpdate(stream); assert.equal(reset.event.type, 'Reset'); resetCursor = reset.cursor }
    const submit = async command => {
      lastEnvelope = { command_id: randomUUID(), binding: view.binding, protocol: 2, command }
      const response = await fetch(`${base}/api/v2/universes/${universe}/commands`, { method: 'POST', headers: a.headers, body: JSON.stringify(lastEnvelope) })
      assert.equal(response.status, 202)
    }
    const quote = async request => {
      const response = await fetch(`${base}/api/v2/universes/${universe}/quotes`, { method: 'POST', headers: a.headers, body: JSON.stringify({ context: { binding: view.binding, request_id: randomUUID() }, request }) })
      assert.equal(response.status, 200, 'quotes remain available during catch-up')
      return response.json()
    }
    const launch = async () => {
      const request = { type: 'Transport', origin, target, ships: [{ owner: view.binding.player, ship_type: 'SmallCargo', count: '2' }], cargo: { metal: '100000000', crystal: '50000000', deuterium: '10000000' }, speed_percent: 100 }
      const q = await quote(request)
      await submit({ ...request, type: 'LaunchTransport', expected_terms_hash: q.terms.terms_hash })
    }
    const actions = [
      async () => { const q = await quote({ type: 'Upgrade', body: origin, building: 'MetalMine' }); await submit({ type: 'StartUpgrade', body: origin, building: 'MetalMine', expected_terms_hash: q.terms.terms_hash }) },
      async () => {}, launch,
      async () => { view = await getView(a); await submit({ type: 'RecallFleet', fleet: view.fleets[0].id }) },
      async () => {}, launch, async () => {}, async () => {},
    ]
    const times = [1000000, 1161000, 4600000, 4601000, 4602000, 8200000, 12941000, 17682000]
    for (let index = 0; index < actions.length; index++) {
      const availabilityProbe = overlap && index === 0
      const fault = index === crashIndex || availabilityProbe
      const faultStage = availabilityProbe ? 'after_writes' : stage
      if (fault) { await db.query('SELECT pg_advisory_lock(901322)'); await db.query("INSERT INTO orbit_test_fault VALUES($1,'pause',true,0)", [faultStage]) }
      await db.query('UPDATE orbit_test_clock SET at_ms=$1', [times[index]])
      await actions[index]()
      if (fault) {
        await until(async () => Number((await db.query('SELECT seen FROM orbit_test_fault WHERE stage=$1', [faultStage])).rows[0].seen) > 0, 'staged fault')
        await getView(a)
        await quote({ type: 'Upgrade', body: origin, building: 'MetalMine' })
        if (availabilityProbe) {
          await getView(a, peerBase)
          const independent = { protocol: 2, binding: beta.binding, command_id: randomUUID(), command: { type: 'CancelConstruction', operation: randomUUID() } }
          const admitted = await fetch(`${peerBase}/api/v2/universes/${universe}/commands`, { method: 'POST', headers: b.headers, body: JSON.stringify(independent) })
          assert.equal(admitted.status, 202, 'another API admits new work while a worker is paused')
          extra = 1
          await until(async () => {
            const response = await fetch(`${peerBase}/api/v2/universes/${universe}/commands/${independent.command_id}?epoch=${beta.binding.epoch}`, { headers: b.headers })
            assert.equal(response.status, 200)
            return (await response.json()).status === 'Rejected'
          }, 'independent scope progresses during paused work')
          await db.query('SELECT pg_advisory_unlock(901322)')
        } else {
          await stop(worker, workerLease, 'SIGKILL')
          await db.query('SELECT pg_advisory_unlock(901322)')
          // Explicit fixture recovery changes operational leases, never game timestamps.
          await db.query('UPDATE execution_scopes SET lease_until=0 WHERE claim_input IS NOT NULL')
          worker = await start('worker', workerLease)
        }
      }
      await until(async () => Number((await db.query('SELECT count(*) FROM transition_journal')).rows[0].count) === index + 1 + extra, `commit ${index}`)
      view = await getView(a)
      if (availabilityProbe) {
        const outcome = await nextUpdate(stream)
        assert.equal(outcome.event.type, 'Outcome')
        await stream.reader.cancel(); stream = null
        await stop(api, apiLease)
        await getView(a, peerBase)
        const retried = await fetch(`${peerBase}/api/v2/universes/${universe}/commands`, { method: 'POST', headers: a.headers, body: JSON.stringify(lastEnvelope) })
        assert.equal(retried.status, 202)
        replay = await openStream(peerBase, resetCursor)
        assert.deepEqual(await nextUpdate(replay), outcome, 'unapplied delivery replays on another API')
        await replay.reader.cancel(); replay = null
        api = await start('api', apiLease)
      }
    }
    const recipient = await getView(b)
    assert.deepEqual(view.bodies[0].amounts, { metal: '1283666000', crystal: '1099453888', deuterium: '984000000' })
    assert.deepEqual(recipient.bodies[0].amounts, { metal: '1391935000', crystal: '1221453888', deuterium: '1010000000' })
    assert.equal(view.bodies[0].inventories[0].count, '2'); assert.equal(view.fleets.length, 0)
    assert.equal(view.reports.length, 4); assert.equal(recipient.reports.length, 1)
    const counts = (await db.query('SELECT (SELECT count(*) FROM commands WHERE NOT done) pending_commands,(SELECT count(*) FROM scheduled_events WHERE NOT done AND NOT cancelled) pending_events,(SELECT count(*) FROM transition_journal) journal')).rows[0]
    assert.deepEqual(counts, { pending_commands: '0', pending_events: '0', journal: String(8 + extra) })
    console.log(`PASS ${overlap ? 'separate redundant API/workers, paused work and stream replay' : crashIndex === null ? 'scoped baseline' : `${stage} worker kill at transition ${crashIndex + 1}`} — exact balances, ships, reports and journal`)
  } finally {
    cleanupAt = performance.now()
    await cleanupAll([
      () => stream?.reader.cancel(), () => replay?.reader.cancel(),
      () => db?.query('SELECT pg_advisory_unlock(901322)'),
      async () => {
        // Drain independent processes together, but settle every stop before DB cleanup.
        const stopped = await Promise.allSettled([
          stop(peerWorker, peerWorkerLease), stop(worker, workerLease),
          stop(peer, peerLease), stop(api, apiLease),
        ])
        const failures = stopped.filter(result => result.status === 'rejected').map(result => result.reason)
        if (failures.length) throw new AggregateError(failures, 'Recovery process cleanup failed')
      },
      () => db?.end(),
      () => admin.query(`DROP DATABASE ${database} WITH (FORCE)`),
      () => { try { unlinkSync(secret) } catch (error) { if (error.code !== 'ENOENT') throw error } },
    ])
    console.log(`TIMING recovery setup=${((preparedAt-began)/1000).toFixed(2)}s scenario=${((cleanupAt-preparedAt)/1000).toFixed(2)}s cleanup=${((performance.now()-cleanupAt)/1000).toFixed(2)}s`)
  }
}
try {
  await scenario()
  for (const stage of ['after_writes', 'after_commit']) for (let index = 0; index < 8; index++) await scenario(index, stage)
  await scenario(null, null, true)
  console.log('18 scoped process recovery scenarios passed.')
} finally {
  await cleanupAll([() => admin.end(), () => apiLease.release(), () => peerLease.release(), () => workerLease.release(), () => peerWorkerLease.release()])
}
