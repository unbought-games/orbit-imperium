// Explicit-only exercise of real local startup, editing, replacement and cleanup.
import { spawn, execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  symlinkSync,
  rmSync,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createConnection } from 'node:net'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import pg from 'pg'
import { resolveLocalWorld, database } from './local-world.mjs'
const source = resolve('.'),
  output = join(source, 'test-results/world-local')
mkdirSync(output, { recursive: true })
const environments = [],
  timings = {}
const measure = async (name, fn) => {
  const at = performance.now()
  const result = await fn()
  timings[name] = Math.round(performance.now() - at)
  console.log(`${name}: ${timings[name]} ms`)
  return result
}
const pause = () => new Promise((r) => setTimeout(r, 100))
async function endpoint(config) {
  return new Promise((ok, no) => {
    const s = createConnection(config.socket)
    let body = ''
    s.on('data', (b) => (body += b))
    s.on('end', () => {
      try {
        ok(JSON.parse(body).url)
      } catch (e) {
        no(e)
      }
    })
    s.on('error', no)
    s.setTimeout(2000, () =>
      s.destroy(Error('local control connection timed out')),
    )
  })
}
async function start(entry) {
  const log = openSync(join(output, `${entry.label}.log`), 'a')
  const command = `import {resolveLocalWorld,runLocalWorld} from ${JSON.stringify(new URL('./local-world.mjs', import.meta.url).href)}; await runLocalWorld('start',resolveLocalWorld(${JSON.stringify(entry.root)}));`
  entry.child = spawn(
    process.execPath,
    ['--input-type=module', '-e', command],
    { cwd: entry.root, env: entry.env, stdio: ['ignore', log, log] },
  )
  closeSync(log)
  const until = performance.now() + 180_000
  while (performance.now() < until) {
    if (entry.child.exitCode !== null)
      throw Error(`local startup failed; inspect ${entry.label}.log`)
    try {
      entry.url = await endpoint(entry.config)
      const r = await fetch(entry.url + '/health/ready', {
        signal: AbortSignal.timeout(3000),
      })
      if (r.ok) return
    } catch {}
    await pause()
  }
  throw Error(
    'local startup did not complete within the explicit preparation guard',
  )
}
async function stop(entry) {
  if (
    entry.child &&
    entry.child.exitCode === null &&
    entry.child.signalCode === null
  ) {
    const exited = once(entry.child, 'exit')
    entry.child.kill('SIGTERM')
    await exited
  }
  entry.child = null
}
function cli(entry, args) {
  return JSON.parse(
    execFileSync(join(source, 'target/debug/orbit'), ['world', ...args], {
      cwd: entry.root,
      env: { ...entry.env, DATABASE_URL: database(entry.config) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  )
}
async function login(entry) {
  const r = await fetch(entry.url + '/api/v1/session', {
    method: 'POST',
    headers: { Origin: entry.url, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'user', password: 'password' }),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(r.status, 200)
  const cookie = r.headers.get('set-cookie').split(';')[0]
  const b = await fetch(entry.url + '/api/v1/bootstrap', {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(b.status, 200)
  const data = await b.json()
  assert.equal(data.result.game.status, 'ready')
  return data.result.game.snapshot.candidate.binding
}
try {
  for (const label of ['first', 'second']) {
    const root = mkdtempSync(join(tmpdir(), `orbit-world-${label}-`))
    for (const file of [
      'target',
      'package.json',
      'node_modules',
      'apps',
      'compose.yaml',
      'scenarios',
    ])
      symlinkSync(join(source, file), join(root, file))
    const env = { ...process.env }
    for (const key of [
      'DATABASE_URL',
      'ORBIT_UNIVERSE_ID',
      'ORBIT_ORIGIN',
      'ORBIT_DEV_HOST',
      'ORBIT_BIND',
    ])
      delete env[key]
    environments.push({
      label,
      root,
      env,
      config: resolveLocalWorld(root, env),
    })
  }
  const [a, b] = environments
  await measure('first_start', () => start(a))
  await measure('second_start', () => start(b))
  assert.notEqual(a.url, b.url)
  assert.notEqual(database(a.config), database(b.config))
  const original = await login(a)
  await login(b)
  await measure('live_edit', async () => {
    cli(a, ['set', 'ships', '1:50:8', 'CRUISER=123', '--user', 'user'])
    const shown = cli(a, ['show', '1:50:8'])
    assert.equal(
      shown.planets[0].ships.find((x) => x.item.id === 'Cruiser').count,
      123,
    )
    assert.equal(
      cli(b, ['show', '1:50:8']).planets[0].ships.find(
        (x) => x.item.id === 'Cruiser',
      ).count,
      20,
    )
  })
  await measure('retained_restart', async () => {
    await stop(a)
    await start(a)
    const after = await login(a)
    assert.equal(after.epoch, original.epoch)
    assert.equal(
      cli(a, ['show', '1:50:8']).planets[0].ships.find(
        (x) => x.item.id === 'Cruiser',
      ).count,
      123,
    )
  })
  const batch = join(a.root, 'edits.json')
  writeFileSync(
    batch,
    JSON.stringify({
      version: 1,
      edits: [
        { op: 'set', user: 'user', planet: '1:50:8', ships: { cRuIsEr: 124 } },
        { op: 'set', user: 'rival', research: { ASTROPHYSICS: 15 } },
      ],
    }),
  )
  await measure('json_batch', async () => {
    cli(a, ['scenario', 'apply', batch])
    assert.equal(
      cli(a, ['show', '1:50:8']).planets[0].ships.find(
        (x) => x.item.id === 'Cruiser',
      ).count,
      124,
    )
  })
  await measure('live_reset', async () => {
    const module = await import('./local-world.mjs')
    await module.runLocalWorld('reset', a.config)
    assert.notEqual((await login(a)).epoch, original.epoch)
    assert.equal(
      cli(a, ['show', '1:50:8']).planets[0].ships.find(
        (x) => x.item.id === 'Cruiser',
      ).count,
      20,
    )
  })
  const db = new pg.Client({ connectionString: database(a.config) })
  await db.connect()
  try {
    assert.equal(
      Number(
        (await db.query('SELECT count(*) FROM universe_memberships')).rows[0]
          .count,
      ),
      17,
    )
  } finally {
    await db.end()
  }
  console.log(
    'PASS isolated checkout roots, real login/bootstrap, live mixed-case edits, multi-user JSON, retained restart, and live reset',
  )
} finally {
  const at = performance.now()
  for (const entry of environments) {
    try {
      const logs = execFileSync(
        'docker',
        ['compose', '-p', entry.config.project, 'logs', '--no-color', 'db'],
        {
          cwd: entry.root,
          env: entry.config.env,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      writeFileSync(join(output, `${entry.label}-postgres.log`), logs)
    } catch (error) {
      console.error(`Database log collection: ${error.message}`)
    }
    await stop(entry)
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        entry.config.project,
        'down',
        '--volumes',
        '--remove-orphans',
      ],
      { cwd: entry.root, env: entry.config.env, stdio: 'ignore' },
    )
    rmSync(entry.root, { recursive: true, force: true })
  }
  timings.cleanup = Math.round(performance.now() - at)
  writeFileSync(join(output, 'timings.json'), JSON.stringify(timings, null, 2))
  console.log(`cleanup: ${timings.cleanup} ms`)
}
