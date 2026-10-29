// Fast frontend loop: real browser/component behavior with HTTP fixtures.
// No database, accounts, gameplay setup, or Rust build.
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import { reserveTestPort } from './fixtures/ports.mjs'
import { mkdirSync } from 'node:fs'
const lease = await reserveTestPort()
const base = `http://127.0.0.1:${lease.port}`
let vite
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
      await vite?.close()
      await lease.release()
      process.exit(code)
    })()
  })
}
try {
  const preparationStarted = performance.now()
  vite = await createServer({
    configFile: 'apps/web/vite.config.ts',
    logLevel: 'warn',
    server: { host: '127.0.0.1', port: lease.port, strictPort: true },
  })
  await lease.release()
  await vite.listen()
  while (true) {
    if (!vite.httpServer?.listening)
      throw Error('UI test server exited before readiness')
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  // HTML readiness does not mean Vite has transformed the lazy game route.
  // Let Vite prepare the static module graph before parallel browsers race to
  // load it. Keep the browser's readiness assertions and limits unchanged.
  await Promise.all(
    ['/src/main.tsx', '/src/features/game-screens.tsx'].map(async (entry) => {
      if (!(await vite.environments.client.transformRequest(entry)))
        throw Error(`UI fixture entry unavailable: ${entry}`)
    }),
  )
  await vite.environments.client.waitForRequestsIdle()
  console.log(
    `UI module preparation: ${Math.round(performance.now() - preparationStarted)}ms`,
  )
  mkdirSync('test-results', { recursive: true })
  browser = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
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
  await vite?.close()
  await lease.release()
}
