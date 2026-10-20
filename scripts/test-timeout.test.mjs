import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { temporaryDirectory, exec, root } from './test-helpers.mjs'

const script = join(root, 'scripts/test-timeout.mjs')
function fixture(t, seconds = 0.4) {
  const directory = temporaryDirectory(t)
  copyFileSync(script, join(directory, 'test-timeout.mjs'))
  writeFileSync(
    join(directory, 'test-budgets.json'),
    JSON.stringify({ probe: seconds }),
  )
  return directory
}
function env() {
  const result = { ...process.env }
  delete result.ORBIT_TEST_DEADLINE_MS
  delete result.ORBIT_TIMEOUT_DEPTH
  return result
}

test('explicit wrapper preserves output, success and failure status', async (t) => {
  const run = (code) =>
    exec(process.execPath, [script, 'signup', process.execPath, '-e', code], {
      env: env(),
      signal: t.signal,
    })
  assert.match((await run('console.log("diagnostic")')).stdout, /diagnostic/)
  await assert.rejects(
    run('console.log("compiler diagnostic"); process.exit(101)'),
    (error) =>
      error.code === 101 && error.stdout.includes('compiler diagnostic'),
  )
  await assert.rejects(
    run('process.kill(process.pid, "SIGTERM")'),
    (error) => error.code === 143,
  )
})

test('child receives the named deadline without extending a parent deadline', async (t) => {
  const args = [
    script,
    'signup',
    process.execPath,
    '-e',
    'console.log(process.env.ORBIT_TEST_DEADLINE_MS)',
  ]
  const before = Date.now()
  const fresh = await exec(process.execPath, args, {
    env: env(),
    signal: t.signal,
  })
  const deadline = Number(fresh.stdout.split('\n')[0])
  assert.ok(deadline >= before + 15000 && deadline <= Date.now() + 15000)
  const parent = Date.now() + 3000
  const inherited = await exec(process.execPath, args, {
    env: { ...env(), ORBIT_TEST_DEADLINE_MS: String(parent) },
    signal: t.signal,
  })
  assert.equal(Number(inherited.stdout.split('\n')[0]), parent)
})

test('unknown budget and missing executable fail without running a command', async (t) => {
  const marker = join(temporaryDirectory(t), 'started')
  await assert.rejects(
    exec(
      process.execPath,
      [
        script,
        'unapproved',
        process.execPath,
        '-e',
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`,
      ],
      { signal: t.signal },
    ),
    (error) => error.stderr.includes('Unknown budget'),
  )
  assert.equal(existsSync(marker), false)
  await assert.rejects(
    exec(process.execPath, [script, 'signup', 'orbit-command-does-not-exist'], {
      signal: t.signal,
    }),
    (error) => error.code !== 0,
  )
})

test('nested timeout kills a child that ignores termination and remains a failure', async (t) => {
  const directory = fixture(t)
  const pidfile = join(directory, 'pid')
  // A separate inner process group must finish cleanup before the outer grace ends.
  const child = `process.on('SIGTERM', () => {}); require('node:fs').writeFileSync(${JSON.stringify(pidfile)}, String(process.pid)); setInterval(() => {}, 1000)`
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`
  writeFileSync(
    join(directory, 'Makefile'),
    `probe:\n\t@${[process.execPath, script, 'signup', process.execPath, '-e', child].map(quote).join(' ')}\n`,
  )
  t.after(() => {
    if (existsSync(pidfile)) {
      try {
        process.kill(Number(readFileSync(pidfile, 'utf8')), 'SIGKILL')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  })
  await assert.rejects(
    exec(
      process.execPath,
      [
        join(directory, 'test-timeout.mjs'),
        'probe',
        'make',
        '-f',
        join(directory, 'Makefile'),
      ],
      { env: env(), signal: t.signal },
    ),
    (error) => error.code === 124,
  )
  const pid = readFileSync(pidfile, 'utf8')
  const state = await exec('ps', ['-p', pid, '-o', 'stat=']).catch((error) => ({
    stdout: error.stdout,
  }))
  assert.ok(
    !state.stdout.trim() || state.stdout.trim().startsWith('Z'),
    `child ${pid} still running`,
  )
})

test(
  'interrupt forwards termination and returns promptly after graceful shutdown',
  { timeout: 1000 },
  async (t) => {
    const directory = fixture(t, 10)
    const marker = join(directory, 'terminated')
    const child = `process.on('SIGTERM', () => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes'); process.exit(0) }); console.log('ready'); setInterval(() => {}, 1000)`
    const wrapper = spawn(
      process.execPath,
      [
        join(directory, 'test-timeout.mjs'),
        'probe',
        process.execPath,
        '-e',
        child,
      ],
      { env: env(), stdio: ['ignore', 'pipe', 'pipe'], signal: t.signal },
    )
    const exit = once(wrapper, 'exit')
    await once(wrapper.stdout, 'data')
    wrapper.kill('SIGINT')
    assert.deepEqual(await exit, [130, null])
    assert.equal(readFileSync(marker, 'utf8'), 'yes')
  },
)
