import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { reserveTestPort } from './ports.mjs'
import { assertStartupRefused } from './startup.mjs'
const run = (source, options = {}) =>
  spawnSync(process.execPath, ['-e', source], {
    encoding: 'utf8',
    timeout: 3000,
    ...options,
  })
test('startup rejection must be the configuration guard, not bind failure or timeout', async () => {
  const lease = await reserveTestPort()
  try {
    const bindFailure = run(
      `require('node:net').createServer().on('error', error => { console.error(error.message); process.exit(1) }).listen(${lease.port}, '127.0.0.1')`,
    )
    assert.match(bindFailure.stderr, /EADDRINUSE/)
    assert.throws(() => assertStartupRefused(bindFailure))
    const timeout = run('setInterval(() => {}, 100)', {
      timeout: 100,
      killSignal: 'SIGKILL',
    })
    assert.throws(() => assertStartupRefused(timeout))
    assert.throws(() => assertStartupRefused(run('process.exit(0)')))
    const refused = run(
      'console.error("Startup refused: incompatible schema/profile or conflicting ORBIT_SPEED; retain the database and use matching configuration"); process.exit(1)',
    )
    assert.doesNotThrow(() => assertStartupRefused(refused))
  } finally {
    await lease.release()
  }
})
