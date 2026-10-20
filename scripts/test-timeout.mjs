// Explicit-validation deadlines only; routine tests use native per-test limits.
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { constants } from 'node:os'

const [name, command, ...args] = process.argv.slice(2)
try {
  if (!name || !command)
    throw Error('Usage: node scripts/test-timeout.mjs BUDGET COMMAND [ARG ...]')
  const budgets = JSON.parse(
    readFileSync(new URL('test-budgets.json', import.meta.url), 'utf8'),
  )
  if (!Object.hasOwn(budgets, name)) throw Error(`Unknown budget: ${name}`)
  process.exitCode = await run(budgets[name], command, args)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}

async function run(seconds, command, args) {
  const started = performance.now()
  const depth = Number(process.env.ORBIT_TIMEOUT_DEPTH || 0)
  const deadline = Math.min(
    Date.now() + seconds * 1000,
    Number(process.env.ORBIT_TEST_DEADLINE_MS || Infinity),
  )
  const child = spawn(command, args, {
    detached: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      ORBIT_TIMEOUT_DEPTH: String(depth + 1),
      ORBIT_TEST_DEADLINE_MS: String(deadline),
    },
  })
  let deadlineTimer, graceTimer, stopped
  const killGroup = (signal) => {
    try {
      process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  let interrupt, terminate
  try {
    return await new Promise((resolve, reject) => {
      const stop = (code) => {
        if (stopped !== undefined) return
        stopped = code
        clearTimeout(deadlineTimer)
        killGroup('SIGTERM')
        // Nested wrappers get shorter grace so they can clean their own groups.
        graceTimer = setTimeout(
          () => {
            killGroup('SIGKILL')
            resolve(code)
          },
          2000 / (depth + 1),
        )
      }
      interrupt = () => stop(130)
      terminate = () => stop(143)
      process.on('SIGINT', interrupt)
      process.on('SIGTERM', terminate)
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        if (stopped !== undefined) {
          // The leader exited; reap any remaining members without waiting out grace.
          killGroup('SIGKILL')
          resolve(stopped)
        } else {
          resolve(
            performance.now() - started > seconds * 1000
              ? 124
              : (code ?? 128 + constants.signals[signal]),
          )
        }
      })
      deadlineTimer = setTimeout(() => {
        console.error(`FAIL: ${name} exceeded ${seconds}s`)
        stop(124)
      }, seconds * 1000)
    })
  } finally {
    clearTimeout(deadlineTimer)
    clearTimeout(graceTimer)
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', terminate)
    console.log(
      `BUDGET ${name}: ${((performance.now() - started) / 1000).toFixed(2)}s / ${seconds}s`,
    )
  }
}
