import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  symlinkSync,
  existsSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { temporaryDirectory, executable, exec, root } from './test-helpers.mjs'

function fixture(t) {
  const directory = temporaryDirectory(t)
  copyFileSync(join(root, 'Makefile'), join(directory, 'Makefile'))
  symlinkSync(join(root, 'scripts'), join(directory, 'scripts'))
  mkdirSync(join(directory, 'target/debug'), { recursive: true })
  executable(
    join(directory, 'target/debug/orbit'),
    `console.log(JSON.stringify({args: process.argv.slice(2), url: process.env.DATABASE_URL, insecure: process.env.ORBIT_ALLOW_INSECURE_HTTP, passwords: process.env.ORBIT_SEED_PASSWORD_FILE}))`,
  )
  const env = { ...process.env }
  for (const key of [
    'DATABASE_URL',
    'ORBIT_DB_PASSWORD',
    'UNIVERSE',
    'AT',
    'MAKEFLAGS',
    'MFLAGS',
    'ORBIT_ALLOW_INSECURE_HTTP',
    'ORBIT_SEED_PASSWORD_FILE',
  ])
    delete env[key]
  const run = (...args) =>
    exec('make', ['--no-print-directory', '-s', ...args], {
      cwd: directory,
      env,
      signal: t.signal,
    })
  return {
    directory,
    env,
    run,
    result: async (...args) =>
      JSON.parse((await run(...args)).stdout.trim().split('\n').at(-1)),
  }
}

test('seed generates fresh UUIDs and current milliseconds, preserving individual overrides', async (t) => {
  const { result } = fixture(t)
  const before = Date.now()
  const first = (await result('dev-seed')).args
  const second = (await result('dev-seed')).args
  assert.equal(first[0], 'dev-seed')
  assert.match(
    first[2],
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  assert.notEqual(first[2], second[2])
  assert.ok(Number(first[4]) >= before && Number(first[4]) <= Date.now())
  const universe = '12345678-1234-4234-8234-123456789abc'
  for (const overrides of [
    [`UNIVERSE=${universe}`],
    ['AT=0'],
    [`UNIVERSE=${universe}`, 'AT=123456'],
  ]) {
    const { args } = await result('dev-seed', ...overrides)
    assert.equal(args.length, 5)
    if (overrides[0].startsWith('UNIVERSE=')) assert.equal(args[2], universe)
    if (overrides.at(-1).startsWith('AT='))
      assert.equal(args[4], overrides.at(-1).slice(3))
  }
})

test('reset requires a universe and defaults time without changing the supplied universe', async (t) => {
  const { result, run } = fixture(t)
  await assert.rejects(
    run('dev-reset'),
    (error) =>
      error.stderr.includes('--universe') && !error.stdout.includes('"args"'),
  )
  const universe = '12345678-1234-4234-8234-123456789abc'
  const { args } = await result('dev-reset', `UNIVERSE=${universe}`)
  assert.deepEqual(args.slice(0, 3), ['dev-reset', '--universe', universe])
  assert.ok(Number(args[4]) > 0)
})

test('invalid seed options fail before launching the server', async (t) => {
  const { run } = fixture(t)
  for (const option of ['UNIVERSE=invalid', 'AT=-1', 'AT=invalid']) {
    await assert.rejects(
      run('dev-seed', option),
      (error) => !error.stdout.includes('"args"'),
    )
  }
})

test('local defaults need no secret files and explicit environment values win', async (t) => {
  const { directory, env, result } = fixture(t)
  assert.deepEqual(await result('db-init'), {
    args: ['db-init'],
    url: 'postgres://orbit:orbit@127.0.0.1:55432/orbit',
    insecure: '1',
    passwords: '.secrets/players',
  })
  assert.equal(existsSync(join(directory, '.secrets')), false)
  env.DATABASE_URL = 'postgres://test:password@example.test/custom'
  env.ORBIT_DB_PASSWORD = 'ignored'
  env.ORBIT_ALLOW_INSECURE_HTTP = '0'
  env.ORBIT_SEED_PASSWORD_FILE = '/private/players'
  assert.deepEqual(await result('db-init'), {
    args: ['db-init'],
    url: env.DATABASE_URL,
    insecure: '0',
    passwords: '/private/players',
  })
})

test('local password is encoded as a URL component', async (t) => {
  const { env, result } = fixture(t)
  env.ORBIT_DB_PASSWORD = 'local@password:/?#%'
  const url = new URL((await result('db-init')).url)
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(decodeURIComponent(url.password), env.ORBIT_DB_PASSWORD)
})

test('seed and reset flush buffered identifiers before replacing the launcher', async (t) => {
  const { directory, env } = fixture(t)
  const preload = join(directory, 'buffer-stdout.mjs')
  // Hold real stream writes until the event loop is idle. An immediate execve
  // discards the queued line; awaiting the write lets beforeExit drain it.
  writeFileSync(
    preload,
    "process.stdout.cork(); process.once('beforeExit', () => process.stdout.uncork())",
  )
  for (const args of [
    ['dev-seed'],
    ['dev-reset', '--universe', '12345678-1234-4234-8234-123456789abc'],
  ]) {
    const { stdout } = await exec(
      process.execPath,
      ['--import', preload, join(root, 'scripts/local.mjs'), ...args],
      { cwd: directory, env, signal: t.signal },
    )
    const lines = stdout.trim().split('\n')
    assert.equal(lines.length, 2, 'identifier log must precede server output')
    const server = JSON.parse(lines[1])
    assert.equal(
      lines[0],
      `${args[0]}: UNIVERSE=${server.args[2]} AT=${server.args[4]}`,
    )
  }
})


test('explicit dev setup initializes schema then creates the chosen universe; dev only serves', async (t) => {
  const { directory, env, run } = fixture(t)
  executable(join(directory, 'cargo'), 'process.exit(0)')
  executable(join(directory, 'npm'), 'process.exit(0)')
  executable(join(directory, 'docker'), 'process.exit(0)')
  env.PATH = `${directory}:${env.PATH}`
  const universe = '12345678-1234-4234-8234-123456789abc'
  const setup = (await run('dev-setup', `UNIVERSE=${universe}`)).stdout.trim().split('\n').map(JSON.parse)
  assert.deepEqual(setup.map(x => x.args), [['db-init'], ['universe', 'create', '--universe', universe]])
  assert.deepEqual(JSON.parse((await run('dev')).stdout.trim()).args, ['serve'])
  executable(join(directory, 'target/debug/orbit'), `
    const args = process.argv.slice(2)
    console.log(JSON.stringify({ args }))
    if (args[0] === 'db-init') process.exit(1)
  `)
  await assert.rejects(run('dev-setup', `UNIVERSE=${universe}`), error => {
    assert.deepEqual(error.stdout.trim().split('\n').map(JSON.parse).map(x => x.args), [['db-init']])
    return error.code !== 0
  })
})
