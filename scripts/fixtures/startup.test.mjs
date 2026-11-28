import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assertStartupRefused } from './startup.mjs'
import { reserveTestPort } from './ports.mjs'
const universe = 'fixture-world'
const diagnostic = {
  event: 'serve_phase_failed',
  stage: 'compatibility',
  error_code: 'ConflictingStartupConfiguration',
  universe,
}
const code = (record, status) =>
  'console.error(' +
  JSON.stringify(JSON.stringify(record)) +
  ');process.exitCode=' +
  status
const run = (source, deadline) =>
  assertStartupRefused(
    process.execPath,
    ['-e', source],
    process.env,
    universe,
    deadline,
  )

test('startup rejection requires the specific world and compatibility guard, plus a natural refusal exit', async () => {
  const lease = await reserveTestPort()
  try {
    await assert.rejects(
      run(
        `require('node:net').createServer().listen(${lease.port}, '127.0.0.1')`,
      ),
      /Missing conflicting/,
    )
    await assert.rejects(
      run('setInterval(()=>{},100)', 100),
      /Missing conflicting/,
    )
    await assert.rejects(
      run(code({ ...diagnostic, universe: 'other' }, 1)),
      /Missing conflicting/,
    )
    await assert.rejects(
      run(code({ ...diagnostic, error_code: 'InvalidRequiredState' }, 1)),
      /Missing conflicting/,
    )
    await assert.rejects(
      run(code(diagnostic, 0)),
      /exit with the configuration refusal/,
    )
    await run(code(diagnostic, 1))
  } finally {
    await lease.release()
  }
})
