// Explicit-only browser acceptance against the real server, PostgreSQL and asset volume.
// Use the disposable Compose project configured for the existing database test runner.
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { reserveTestPort } from './fixtures/ports.mjs'

const started = performance.now()
const timings = {}
const db = `orbit_insignias_${randomUUID().replaceAll('-', '')}`
const directory = mkdtempSync(join(tmpdir(), 'orbit-insignias-'))
const lease = await reserveTestPort()
const base = `http://localhost:${lease.port}`
const compose = (...args) => execFileSync('docker', ['compose', ...args], { stdio: 'pipe' })
const env = { ...process.env, DATABASE_URL: `postgres://orbit:${encodeURIComponent(process.env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT ?? '55432'}/${db}`, ORBIT_AUTH_MODE: 'local', ORBIT_COSMETIC_ACCESS: 'unrestricted', ORBIT_ASSET_STORE: 'files', ORBIT_ASSET_DIRECTORY: directory, ORBIT_BIND: `127.0.0.1:${lease.port}`, ORBIT_ORIGIN: base, ORBIT_ALLOW_INSECURE_HTTP: '1', ORBIT_ASSETS: 'apps/web/dist' }
const svg = readFileSync('crates/storage-postgres/tests/fixtures/cosmetics/test-star.svg')
const hash = createHash('sha256').update(svg).digest('hex')
const manifest = Buffer.from(JSON.stringify({ version: 1, insignias: [{ id: 'test-star', name: 'Test star', supporter: true, sha256: hash }] }))
const manifestHash = createHash('sha256').update(manifest).digest('hex')
mkdirSync(join(directory, 'insignias/v1/test-star'), { recursive: true })
mkdirSync(join(directory, 'insignias/catalogs'), { recursive: true })
writeFileSync(join(directory, `insignias/v1/test-star/${hash}.svg`), svg)
writeFileSync(join(directory, `insignias/catalogs/${manifestHash}.json`), manifest)
env.ORBIT_COSMETIC_CATALOG = `insignias/catalogs/${manifestHash}.json`
delete env.ORBIT_ACCOUNTS_PROFILE_CREDENTIAL
delete env.ORBIT_ACCOUNTS_API_URL
let server, browser
let created = false
let serverLog = ''
async function stop() {
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve))
    server.kill('SIGINT')
    await exited
  }
}
async function start() {
  server = spawn('target/debug/orbit', ['serve'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', c => { serverLog += c })
  server.stderr.on('data', c => { serverLog += c })
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) throw Error(`Server exited: ${serverLog}`)
    try { if ((await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1000) })).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw Error('Insignia acceptance server failed readiness')
}
try {
  mkdirSync('test-results', { recursive: true })
  compose('exec', '-T', 'db', 'createdb', '-U', 'orbit', db)
  created = true
  execFileSync('target/debug/orbit', ['world', 'scenario', 'load', 'playground'], { env, stdio: 'pipe' })
  await lease.release()
  await start()
  timings.preparation_ms = Math.round(performance.now() - started)
  const browserStarted = performance.now()
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page.setDefaultTimeout(30000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const login = await page.request.post(`${base}/api/v1/session`, { headers: { Origin: base }, data: { name: 'user', password: 'password' } })
  assert.equal(login.status(), 200)
  const session = await login.json()
  const slug = session.memberships[0].universe_name.toLowerCase().replaceAll(' ', '-')
  await page.goto(`${base}/u/${slug}/settings`)
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  await panel.getByRole('button', { name: 'New design' }).click()
  await panel.getByLabel('Design name', { exact: true }).fill('Aurelian standard')
  await panel.getByRole('button', { name: 'Test star', exact: true }).click()
  await panel.getByLabel('Symbol color', { exact: true }).fill('#f2ca74')
  await panel.getByLabel('Background color', { exact: true }).fill('#743c4c')
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await panel.getByRole('status').filter({ hasText: 'Design saved and equipped.' }).waitFor()
  const rows = compose('exec', '-T', 'db', 'psql', '-U', 'orbit', '-d', db, '-Atc', "SELECT name||':'||(recipe->>'symbol') FROM insignia_designs").toString().trim()
  assert.equal(rows, 'Aurelian standard:test-star')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`${base}/u/${slug}/settings`)
    await panel.getByLabel('Design name', { exact: true }).waitFor()
    assert.equal(await panel.getByLabel('Design name', { exact: true }).inputValue(), 'Aurelian standard')
    await panel.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 72))
    await (width === 390 ? page : panel).screenshot({ path: `test-results/insignia-live-settings-${width}x1000.png`, animations: 'disabled' })
    if (width === 390) {
      await panel.getByRole('button', { name: 'Save & equip' }).evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 180))
      await page.screenshot({ path: 'test-results/insignia-live-settings-controls-390x1000.png', animations: 'disabled' })
    }
    await page.getByRole('link', { name: 'Galaxy', exact: true }).first().click()
    const own = page.getByRole('listitem').filter({ hasText: 'user' }).first()
    await own.locator('span[style*="--insignia-foreground"]').waitFor()
    await own.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 260))
    await page.screenshot({ path: `test-results/insignia-live-galaxy-${width}x1000.png`, animations: 'disabled' })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  timings.browser_ms = Math.round(performance.now() - browserStarted)
  const restartStarted = performance.now()
  await stop(); await start()
  const loaded = page.waitForResponse(r => r.url().endsWith('/insignias') && r.ok())
  await page.goto(`${base}/u/${slug}/settings`)
  const state = await (await loaded).json()
  assert.equal(state.library.designs[0].name, 'Aurelian standard')
  assert.equal(state.appearance.recipe.symbol, 'test-star')
  const asset = await page.request.get(`${base}${state.appearance.asset_url}`)
  assert.equal(asset.status(), 200)
  assert.match(await asset.text(), /^<svg/)
  assert.deepEqual(errors, [])
  timings.restart_ms = Math.round(performance.now() - restartStarted)
  console.log('Live insignia acceptance passed: browser save/equip, PostgreSQL persistence, stored artwork, Galaxy, desktop/mobile, and API restart.')
} finally {
  const cleanupStarted = performance.now()
  await browser?.close()
  await stop()
  await lease.release()
  if (created) compose('exec', '-T', 'db', 'dropdb', '-U', 'orbit', '--force', db)
  rmSync(directory, { recursive: true, force: true })
  timings.cleanup_ms = Math.round(performance.now() - cleanupStarted)
  timings.total_ms = Math.round(performance.now() - started)
  writeFileSync('test-results/insignias-live-timings.json', JSON.stringify(timings, null, 2) + '\n')
  writeFileSync('test-results/insignias-live-server.log', serverLog)
  console.log(JSON.stringify(timings))
}
