// Fast frontend loop: real browser/component behavior with HTTP fixtures.
// No database, accounts, gameplay setup, or Rust build.
import { spawn } from 'node:child_process'
import { reserveTestPort } from './fixtures/ports.mjs'
import { mkdirSync } from 'node:fs'
const lease = await reserveTestPort()
const base = `http://127.0.0.1:${lease.port}`
await lease.release()
const vite = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--config',
    'apps/web/vite.config.ts',
    '--host',
    '127.0.0.1',
    '--port',
    String(lease.port),
    '--strictPort',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)
let browser
const stop = async (child) => {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    void (async () => {
      await stop(browser)
      await stop(vite)
      process.exit(code)
    })()
  })
}
try {
  const deadline = Date.now() + 15_000
  while (true) {
    if (vite.exitCode !== null)
      throw Error('UI test server exited before readiness')
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {}
    if (Date.now() > deadline)
      throw Error('UI test server did not become ready')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  mkdirSync('test-results', { recursive: true })
  browser = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ORBIT_UI_E2E: '1',
        ORBIT_TEST_BASE_URL: base,
        ORBIT_TEST_OUTPUT_DIR: 'test-results/browser-ui',
        ORBIT_MVP_E2E: '',
        ORBIT_PROGRESSION_E2E: '',
        ORBIT_MISSIONS_E2E: '',
        ORBIT_RAIDING_E2E: '',
      },
    },
  )
  process.exitCode = await new Promise((resolve) =>
    browser.once('exit', (code) => resolve(code ?? 1)),
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await stop(browser)
  await stop(vite)
}
