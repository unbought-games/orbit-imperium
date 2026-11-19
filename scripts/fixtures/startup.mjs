import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'

/** The guard must report the expected world before the readiness deadline.
 * The process then exits naturally after its documented restart backoff. */
export async function assertStartupRefused(
  command,
  args,
  env,
  universe,
  deadlineMs = 5000,
) {
  const child = spawn(command, args, {
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const log = createInterface({ input: child.stderr })
  let refused = false
  const deadline = setTimeout(() => child.kill('SIGKILL'), deadlineMs)
  try {
    const exited = once(child, 'close')
    const inspect = async () => {
      for await (const line of log) {
        if (!line.startsWith('{')) continue
        const record = JSON.parse(line)
        if (
          record.event === 'serve_phase_failed' &&
          record.stage === 'compatibility' &&
          record.error_code === 'ConflictingStartupConfiguration' &&
          record.universe === universe
        ) {
          refused = true
          clearTimeout(deadline)
        }
      }
    }
    const [[status, signal]] = await Promise.all([exited, inspect()])
    assert.ok(
      refused,
      'Missing conflicting startup configuration diagnostic for the requested universe',
    )
    assert.equal(
      signal,
      null,
      'Startup must refuse configuration without being killed',
    )
    assert.equal(status, 1, 'Startup must exit with the configuration refusal')
  } finally {
    clearTimeout(deadline)
    log.close()
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
}
