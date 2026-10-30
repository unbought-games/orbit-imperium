// Validate actual production assets with fixture-only bootstrap/auth responses.
import { spawn } from 'node:child_process'
import { preview } from 'vite'
import { reserveTestPort } from './fixtures/ports.mjs'

const lease = await reserveTestPort()
let server
let browser
async function cleanup() {
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM')
    await new Promise((resolve) => browser.once('exit', resolve))
  }
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await lease.release()
}
for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, () => {
    void cleanup().then(() => process.exit(code))
  })
}
try {
  const started = performance.now()
  await lease.release()
  server = await preview({
    configFile: 'apps/web/vite.config.ts',
    preview: { host: '127.0.0.1', port: lease.port, strictPort: true },
  })
  console.log(
    `Built homepage preparation: ${Math.round(performance.now() - started)}ms`,
  )
  browser = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ORBIT_UI_E2E: '1',
        ORBIT_HOMEPAGE_E2E: '1',
        ORBIT_TEST_BASE_URL: `http://127.0.0.1:${lease.port}`,
        ORBIT_TEST_OUTPUT_DIR: 'test-results/browser-homepage',
      },
    },
  )
  process.exitCode = await new Promise((resolve) =>
    browser.once('exit', (code) => resolve(code ?? 1)),
  )
} finally {
  await cleanup()
}
