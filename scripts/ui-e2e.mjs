// Fast frontend loop: real browser/component behavior with HTTP fixtures.
// No database, accounts, gameplay setup, or Rust build.
import { spawn } from 'node:child_process'
import { build, createServer, preview } from 'vite'
import { reserveTestPort } from './fixtures/ports.mjs'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const components = process.argv[2] === '--components'
const args = process.argv.slice(components ? 3 : 2)
const lease = await reserveTestPort()
const base = `http://127.0.0.1:${lease.port}`
let vite
let browser
let assets
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
      if (assets) rmSync(assets, { recursive: true, force: true })
      process.exit(code)
    })()
  })
}
try {
  const preparationStarted = performance.now()
  if (components) {
    vite = await createServer({
      configFile: 'apps/web/vite.components.config.ts',
      logLevel: 'warn',
      server: {
        host: '127.0.0.1',
        port: lease.port,
        strictPort: true,
        hmr: false,
        watch: null,
      },
    })
    await lease.release()
    await vite.listen()
    if (!(await vite.environments.client.transformRequest('/main.tsx')))
      throw Error('Component fixture entry unavailable')
    await vite.environments.client.waitForRequestsIdle()
  } else {
    // Complete lazy route compilation before the browser's assertions begin.
    // Keep the fixture suite's development-only previews and React checks. This
    // is a test artifact, not the production release build or homepage check.
    assets = mkdtempSync(join(tmpdir(), 'orbit-browser-fixture-'))
    await build({
      configFile: 'apps/web/vite.config.ts',
      mode: 'test',
      logLevel: 'warn',
      define: {
        'import.meta.env.DEV': 'true',
        'process.env.NODE_ENV': JSON.stringify('development'),
      },
      build: {
        outDir: assets,
        emptyOutDir: true,
        minify: false,
        rollupOptions: { input: resolve('apps/web/index.html') },
      },
    })
    await lease.release()
    const server = await preview({
      configFile: 'apps/web/vite.config.ts',
      logLevel: 'warn',
      build: { outDir: assets },
      preview: {
        host: '127.0.0.1',
        port: lease.port,
        strictPort: true,
        proxy: {},
      },
    })
    vite = {
      httpServer: server.httpServer,
      close: () => new Promise((done) => server.httpServer.close(done)),
    }
  }
  if (!(await fetch(base, { signal: AbortSignal.timeout(1000) })).ok)
    throw Error('Browser fixture HTML unavailable after server startup')
  console.log(
    `${components ? 'Component module' : 'Application bundle'} preparation: ${Math.round(performance.now() - preparationStarted)}ms`,
  )
  mkdirSync('test-results', { recursive: true })
  browser = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      ...(components ? ['--config=playwright.components.config.ts'] : []),
      ...args,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ORBIT_UI_E2E: '1',
        ORBIT_TEST_BASE_URL: base,
        ORBIT_TEST_OUTPUT_DIR:
          process.env.ORBIT_TEST_OUTPUT_DIR ??
          (components ? 'test-results/components' : 'test-results/browser-ui'),
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
  if (assets) rmSync(assets, { recursive: true, force: true })
}
