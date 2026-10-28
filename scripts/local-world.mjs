// Local lifecycle only. All game state is managed by the normal orbit binary.
import { createHash } from 'node:crypto'
import { spawn, execFileSync } from 'node:child_process'
import { createServer, createConnection } from 'node:net'
import { mkdirSync, unlinkSync, existsSync, realpathSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function resolveLocalWorld(root, env = process.env) {
  const identity = createHash('sha256')
    .update(realpathSync(root))
    .digest('hex')
    .slice(0, 12)
  return {
    root,
    project: `orbit-dev-${identity}`,
    socket: join(root, '.secrets', 'dev.sock'),
    env: { ...env, ORBIT_DB_PUBLISHED_PORT: '0' },
  }
}
function compose(config, args) {
  return execFileSync('docker', ['compose', '-p', config.project, ...args], {
    cwd: config.root,
    env: config.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
}
export function database(config, { start = false } = {}) {
  if (start) compose(config, ['up', '-d', '--wait', 'db'])
  const address = compose(config, ['port', 'db', '5432'])
  const port = Number(address.split(':').at(-1))
  if (!port) throw Error('Local database is not running. Run make dev.')
  return `postgres://orbit:${encodeURIComponent(config.env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:${port}/orbit`
}
export async function freePort(host = '127.0.0.1') {
  const server = createServer()
  await new Promise((ok, no) => {
    server.once('error', no)
    server.listen(0, host, ok)
  })
  const port = server.address().port
  await new Promise((ok) => server.close(ok))
  return port
}
export function run(file, args, options) {
  return new Promise((ok, no) => {
    const child = spawn(file, args, { stdio: 'inherit', ...options })
    let output = ''
    child.stdout?.on('data', (chunk) => (output += chunk))
    child.once('error', no)
    child.once('exit', (code, signal) =>
      code === 0 ? ok(output) : no(Error(`${file} exited ${code ?? signal}`)),
    )
  })
}
async function running(config) {
  return new Promise((ok, no) => {
    const socket = createConnection(config.socket)
    let text = ''
    socket.on('data', (chunk) => (text += chunk))
    socket.on('end', () => {
      try {
        ok(JSON.parse(text))
      } catch (error) {
        no(error)
      }
    })
    socket.on('error', (error) =>
      ['ENOENT', 'ECONNREFUSED'].includes(error.code) ? ok(null) : no(error),
    )
  })
}
export async function runLocalWorld(action, config) {
  if (config.env.DATABASE_URL)
    throw Error(
      'make dev manages its own worktree database. Use orbit directly with DATABASE_URL for another database.',
    )
  const current = await running(config)
  const url = database(config, { start: true })
  const env = {
    ...config.env,
    DATABASE_URL: url,
    ORBIT_ALLOW_INSECURE_HTTP: '1',
  }
  delete env.ORBIT_UNIVERSE_ID
  const binary = join(config.root, 'target', 'debug', 'orbit')
  await run(binary, ['db-init'], { cwd: config.root, env })
  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: url })
  await db.connect()
  let count
  try {
    count = Number(
      (await db.query('SELECT count(*) FROM universes')).rows[0].count,
    )
  } finally {
    await db.end()
  }
  if (action === 'reset' || count === 0) {
    await run(
      binary,
      [
        'world',
        'scenario',
        'load',
        'playground',
        ...(count ? ['--replace'] : []),
      ],
      { cwd: config.root, env, stdio: ['ignore', 'pipe', 'inherit'] },
    )
    console.log('Playground created. Login: user/password')
  }
  if (count > 1)
    throw Error(
      'Local database has multiple universes; use orbit world --universe explicitly.',
    )
  if (current) {
    console.log(
      `Game running at ${current.url}\nPlayground login: user/password`,
    )
    return
  }
  if (action === 'setup') return
  const host = config.env.ORBIT_DEV_HOST || '127.0.0.1'
  const backend = await freePort()
  const frontend = config.env.ORBIT_ORIGIN
    ? Number(new URL(config.env.ORBIT_ORIGIN).port || 80)
    : await freePort(host)
  const origin =
    config.env.ORBIT_ORIGIN ||
    `http://${host === '0.0.0.0' ? 'localhost' : host}:${frontend}`
  Object.assign(env, {
    ORBIT_BIND: `127.0.0.1:${backend}`,
    ORBIT_ORIGIN: origin,
    ORBIT_DEV_API_URL: `http://127.0.0.1:${backend}`,
    ORBIT_DEV_PORT: String(frontend),
  })
  mkdirSync(join(config.root, '.secrets'), { recursive: true })
  if (existsSync(config.socket)) unlinkSync(config.socket)
  const control = createServer((socket) =>
    socket.end(JSON.stringify({ url: origin })),
  )
  await new Promise((ok, no) => {
    control.once('error', no)
    control.listen(config.socket, ok)
  })
  const children = []
  let stopping = false
  const cleanup = () => {
    if (stopping) return
    stopping = true
    for (const child of children) child.kill('SIGTERM')
    control.close()
    try {
      unlinkSync(config.socket)
    } catch (error) {
      if (error.code !== 'ENOENT') console.error(error.message)
    }
  }
  const stop = () => cleanup()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    console.log(
      `Game: ${origin}\nPlayground login: user/password\nWorld edits: ./orbit world --help`,
    )
    const done = [
      [binary, ['serve']],
      [
        process.execPath,
        [
          join(config.root, 'node_modules', 'vite', 'bin', 'vite.js'),
          '--config',
          'apps/web/vite.config.ts',
          '--host',
          host,
          '--port',
          String(frontend),
          '--strictPort',
        ],
      ],
    ].map(
      ([file, args]) =>
        new Promise((ok, no) => {
          const child = spawn(file, args, {
            cwd: config.root,
            env,
            stdio: 'inherit',
          })
          children.push(child)
          child.once('error', no)
          child.once('exit', (code, signal) =>
            stopping || code === 0
              ? ok()
              : no(Error(`${file} exited ${code ?? signal}`)),
          )
        }),
    )
    await Promise.race(done)
    cleanup()
    await Promise.allSettled(done)
  } finally {
    cleanup()
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const action = process.argv[2]
  if (!['start', 'reset', 'setup'].includes(action))
    throw Error('Expected start, reset or setup')
  await runLocalWorld(action, resolveLocalWorld(root)).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
