// Explicit-only first-slice acceptance. Uses a disposable database in the caller's
// isolated Compose project; never accepts an ambient application DATABASE_URL.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium, expect } from '@playwright/test'
import sharp from 'sharp'
import { reserveTestPort } from './fixtures/ports.mjs'

assert.ok(!process.env.DATABASE_URL, 'Refusing an ambient application database')
assert.ok(
  process.env.COMPOSE_PROJECT_NAME,
  'Set a disposable COMPOSE_PROJECT_NAME',
)
assert.ok(process.env.ORBIT_TEST_DB_PORT, 'Set the disposable database port')
const started = performance.now(),
  timings = {}
const database = `orbit_ship_${randomUUID().replaceAll('-', '')}`
const output = resolve('test-results/ship-customization/live')
const assets = await mkdtemp(join(tmpdir(), 'orbit-ship-assets-'))
const binary = resolve(
  process.env.ORBIT_TEST_SERVER_BINARY ?? 'target/debug/orbit',
)
const apiPort = await reserveTestPort(),
  webPort = await reserveTestPort(),
  renderPort = await reserveTestPort()
const origin = `http://127.0.0.1:${webPort.port}`,
  apiOrigin = `http://127.0.0.1:${apiPort.port}`
const token = randomUUID() + randomUUID()
const compose = (...args) =>
  execFileSync('docker', ['compose', ...args], { stdio: 'pipe' })
const env = {
  ...process.env,
  DATABASE_URL: `postgres://orbit:${encodeURIComponent(process.env.ORBIT_DB_PASSWORD || 'orbit')}@127.0.0.1:${process.env.ORBIT_TEST_DB_PORT}/${database}`,
  ORBIT_AUTH_MODE: 'local',
  ORBIT_ALLOW_INSECURE_HTTP: '1',
  ORBIT_COSMETIC_ACCESS: 'unrestricted',
  ORBIT_ASSET_STORE: 'files',
  ORBIT_ASSET_DIRECTORY: assets,
  ORBIT_ASSETS: resolve('apps/web/dist'),
  ORBIT_BIND: `127.0.0.1:${apiPort.port}`,
  ORBIT_ORIGIN: origin,
  ORBIT_APPEARANCE_RENDER_URL: `http://127.0.0.1:${renderPort.port}`,
  ORBIT_APPEARANCE_RENDER_TOKEN: token,
}
for (const key of [
  'ORBIT_COSMETIC_CATALOG',
  'ORBIT_ACCOUNTS_PROFILE_CREDENTIAL',
  'ORBIT_ACCOUNTS_API_URL',
])
  delete env[key]
let api,
  renderer,
  web,
  browser,
  created = false
const logs = { api: '', renderer: '' }
function launch(kind, command, args, environment) {
  const child = spawn(command, args, {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (bytes) => {
    logs[kind] += bytes
  })
  child.stderr.on('data', (bytes) => {
    logs[kind] += bytes
  })
  return child
}
async function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = new Promise((resolve) => child.once('exit', resolve))
    child.kill('SIGINT')
    await done
  }
}
async function ready(url, child, kind) {
  const deadline = performance.now() + 60_000
  while (performance.now() < deadline) {
    if (child.exitCode !== null) throw Error(`${kind} exited: ${logs[kind]}`)
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw Error(`${kind} readiness failed: ${logs[kind]}`)
}
async function startApi() {
  await apiPort.release()
  api = launch('api', binary, ['serve'], env)
  await ready(apiOrigin + '/health/ready', api, 'api')
}
try {
  await mkdir(output, { recursive: true })
  compose('exec', '-T', 'db', 'createdb', '-U', 'orbit', database)
  created = true
  execFileSync(binary, ['world', 'scenario', 'load', 'playground'], {
    env,
    stdio: 'pipe',
  })
  await renderPort.release()
  renderer = launch(
    'renderer',
    process.execPath,
    ['tools/ship-appearance/server.mjs'],
    {
      ...process.env,
      ORBIT_SHIP_RENDERER_TOKEN: token,
      ORBIT_SHIP_RENDERER_PORT: String(renderPort.port),
      ORBIT_SHIP_ASSET_TOKEN: token,
      ORBIT_SHIP_ASSET_ORIGIN: apiOrigin,
      ORBIT_SHIP_ASSET_ALLOW_PRIVATE: 'true',
    },
  )
  await ready(
    `http://127.0.0.1:${renderPort.port}/healthz`,
    renderer,
    'renderer',
  )
  await startApi()
  await webPort.release()
  process.env.ORBIT_DEV_API_URL = apiOrigin
  web = await createServer({
    configFile: 'apps/web/vite.config.ts',
    logLevel: 'warn',
    define: {
      'import.meta.env.VITE_SHIP_CUSTOMIZATION': JSON.stringify('true'),
    },
    server: { host: '127.0.0.1', port: webPort.port, strictPort: true },
  })
  await web.listen()
  timings.preparation_ms = Math.round(performance.now() - started)
  browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  })
  page.setDefaultTimeout(30_000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await page.request.post(origin + '/api/v1/session', {
    headers: { Origin: origin },
    data: { name: 'user', password: 'password' },
  })
  assert.equal(login.status(), 200, await login.text())
  const session = await login.json(),
    membership = session.memberships[0]
  const bound = await page.request.get(
    `${origin}/api/v4/universes/${membership.universe}/binding?request_id=${randomUUID()}`,
  )
  assert.equal(bound.status(), 200, await bound.text())
  const { binding } = await bound.json()
  assert.match(binding.player, /^[a-f0-9-]{36}$/)
  const body = compose(
    'exec',
    '-T',
    'db',
    'psql',
    '-U',
    'orbit',
    '-d',
    database,
    '-Atc',
    `SELECT id FROM bodies WHERE owner='${binding.player}' AND kind='Planet' AND galaxy=1 AND system=51 AND position=8`,
  )
    .toString()
    .trim()
  assert.match(body, /^[a-f0-9-]{36}$/)
  const slug = membership.universe_name.toLowerCase().replaceAll(' ', '-')
  const route = `/u/${slug}/b/${body}/shipyard/light-fighter`
  const endpoint = `${origin}/api/v1/universes/${binding.universe}/ship-appearances`
  const headers = { Origin: origin, 'x-csrf-token': session.csrf }
  async function act(action, id = randomUUID()) {
    const response = await page.request.post(endpoint, {
      headers,
      data: { context: { binding, request_id: id }, action },
    })
    assert.equal(response.status(), 200, await response.text())
    return response.json()
  }
  const emblemId = randomUUID()
  const emblemRecipe = {
    version: 2,
    symbol: 'compass',
    foreground: '#d2dce5',
    background: '#1e2e40',
    shape: 'circle',
    layers: [
      { symbol: 'forge-wayfinder', color: '#d2dce5' },
      { symbol: 'forge-crown', color: '#d2dce5' },
    ],
  }
  async function emblem(revision, recipe) {
    const response = await page.request.post(
      `${origin}/api/v1/universes/${binding.universe}/insignias`,
      {
        headers: { ...headers, 'x-orbit-catalog': '4' },
        data: {
          context: { binding, request_id: randomUUID() },
          action: {
            type: 'Save',
            equip: true,
            design: {
              id: emblemId,
              name: 'Acceptance standard',
              revision,
              recipe,
            },
          },
        },
      },
    )
    assert.equal(response.status(), 200, await response.text())
  }
  await emblem(0, emblemRecipe)
  async function navigate(path) {
    const delivered = page.waitForResponse(
      (r) => r.url() === endpoint && r.request().method() === 'POST',
    )
    const options = path.includes('/shipyard/')
      ? page.waitForResponse((r) => {
          if (
            !/\/progression-options(?:\/bulk)?$/.test(r.url()) ||
            r.request().method() !== 'POST'
          )
            return false
          const data = r.request().postDataJSON()
          return [data.request, ...(data.requests ?? [])].some(
            (request) =>
              request?.body === body && request?.item?.id === 'LightFighter',
          )
        })
      : null
    await page.goto(origin + path)
    const response = await delivered
    assert.equal(response.status(), 200)
    await response.finished()
    if (options) {
      const quote = await options
      assert.equal(quote.status(), 200)
      await quote.finished()
      await expect(
        page
          .getByRole('region', { name: 'New order', exact: true })
          .getByRole('button', { name: 'Build', exact: true }),
      ).toBeEnabled()
    }
    // Dismiss the playground's existing toast stack through its keyboard action
    // before capturing this feature; this creates no gameplay command.
    const notices = page.getByLabel('Recent game events').getByRole('button')
    for (
      let remaining = 0;
      remaining < 8 && (await notices.count());
      remaining++
    ) {
      const notice = await notices.first().elementHandle()
      assert.ok(notice)
      await notice.press('Escape')
      await notice.waitForElementState('hidden')
    }
  }
  async function shipImageReady() {
    const image = page
      .getByRole('figure', { name: 'Light Fighter illustration' })
      .locator('img')
    await expect(image).toHaveAttribute('src', /api\/media\/ship-appearances/)
    await expect
      .poll(() =>
        image.evaluate((node) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true)
  }
  await navigate(route)
  await page.getByRole('button', { name: 'Customize', exact: true }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Light Fighter',
    exact: true,
  })
  await expect(dialog.locator('canvas')).toHaveCSS('opacity', '1', {
    timeout: 30_000,
  })
  await dialog
    .getByRole('button', { name: 'Design options', exact: true })
    .click()
  const options = page.getByRole('dialog', {
    name: 'Design options',
    exact: true,
  })
  await options
    .getByLabel('Design name', { exact: true })
    .fill('Midnight standard')
  await options.getByLabel('Design name', { exact: true }).press('Escape')
  await expect(options).toHaveCount(0)
  await dialog
    .getByRole('button', { name: 'Primary: Graphite', exact: true })
    .click()
  await dialog.getByRole('button', { name: 'Accent', exact: true }).click()
  await dialog
    .getByRole('button', { name: 'Accent: Gold', exact: true })
    .click()
  await expect(
    dialog.getByRole('switch', { name: 'Show empire emblem' }),
  ).toBeChecked()
  const saved = page.waitForResponse(
    (r) =>
      r.url() === endpoint &&
      r.request().postDataJSON()?.action?.type === 'Save',
  )
  await dialog
    .getByRole('button', { name: 'Save and equip', exact: true })
    .click()
  const response = await saved
  assert.equal(response.status(), 200)
  await response.finished()
  let state
  await expect
    .poll(
      async () => {
        state = await act({ type: 'Load' })
        return state.equipment[0].render?.stage
      },
      { timeout: 60_000 },
    )
    .toBe('ready')
  await expect(dialog.locator('li[aria-current="step"]')).toHaveText('Saved')
  const firstAsset = state.equipment[0].artwork.id
  for (const variant of state.equipment[0].artwork.variants) {
    const media = await page.request.get(origin + variant.url)
    assert.equal(media.status(), 200)
    const metadata = await sharp(await media.body()).metadata()
    assert.equal(metadata.width, variant.width)
    assert.equal(metadata.height, variant.height)
    assert.equal(metadata.hasAlpha, true)
    assert.equal((await fetch(apiOrigin + variant.url)).status, 401)
  }
  await dialog.screenshot({
    path: join(output, 'hangar-desktop-1440x1000.png'),
  })
  await dialog
    .getByRole('button', { name: 'Back to Shipyard', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await shipImageReady()
  await page.screenshot({
    path: join(output, 'shipyard-equipped-desktop-1440x1000.png'),
    fullPage: true,
  })
  await navigate(route)
  await expect(
    page
      .getByRole('figure', { name: 'Light Fighter illustration' })
      .locator('img'),
  ).toHaveAttribute('src', /api\/media\/ship-appearances/)
  await stop(api)
  await apiPort.hold()
  await startApi()
  state = await act({ type: 'Load' })
  assert.equal(state.equipment[0].artwork.id, firstAsset)
  await emblem(1, {
    ...emblemRecipe,
    layers: [{ symbol: 'forge-starwing', color: '#79d8ed' }],
  })
  await expect
    .poll(
      async () => {
        state = await act({ type: 'Load' })
        return (
          state.equipment[0].render.stage === 'ready' &&
          state.equipment[0].artwork.id !== firstAsset
        )
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  assert.equal(
    state.library[0].revision,
    1,
    'Emblem edits must not save a new ship recipe',
  )
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await navigate(route)
    await shipImageReady()
    await page.screenshot({
      path: join(output, `shipyard-current-emblem-${width}x${height}.png`),
      fullPage: width === 1440,
    })
    await page.getByRole('button', { name: 'Customize', exact: true }).click()
    await expect(dialog.locator('canvas')).toHaveAttribute(
      'aria-label',
      'Midnight standard — live ship preview',
    )
    await expect(dialog.locator('canvas')).toHaveCSS('opacity', '1')
    await dialog.screenshot({
      path: join(output, `hangar-current-emblem-${width}x${height}.png`),
    })
    if (width === 390) {
      await dialog
        .getByRole('button', { name: 'Save and equip', exact: true })
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: join(output, 'hangar-controls-390x844.png'),
      })
    }
    await dialog
      .getByRole('button', { name: 'Back to Shipyard', exact: true })
      .click()
    await expect(dialog).toHaveCount(0)
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    )
    await navigate(`/u/${slug}/b/${body}/fleets`)
    const inventory = page.getByRole('region', {
      name: 'Stationed ships',
      exact: true,
    })
    const ship = inventory
      .locator('img[src*="/api/media/ship-appearances/"]')
      .first()
    await expect(ship).toBeVisible()
    await expect
      .poll(() =>
        ship.evaluate((node) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true)
    await inventory.screenshot({
      path: join(output, `fleet-inventory-${width}x${height}.png`),
    })
  }
  assert.deepEqual(errors, [])
  timings.acceptance_ms = Math.round(
    performance.now() - started - timings.preparation_ms,
  )
  await writeFile(
    join(output, 'verification.json'),
    JSON.stringify(
      {
        tested_revision: execFileSync('git', ['rev-parse', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
        dirty: execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim(),
        timings,
        first_asset: firstAsset,
        updated_asset: state.equipment[0].artwork.id,
        checks: [
          'UI save/equip',
          'transparent variants',
          'anonymous media rejected',
          'reload',
          'API restart',
          'live emblem propagation',
          'unchanged ship revision after emblem edit',
          'desktop/mobile',
          'fleet inventory',
        ],
        page_errors: errors,
      },
      null,
      2,
    ),
  )
  console.log(
    'Ship customization real-backend acceptance passed',
    JSON.stringify(timings),
  )
} finally {
  await browser?.close()
  await web?.close()
  await stop(api)
  await stop(renderer)
  await Promise.all([
    apiPort.release(),
    webPort.release(),
    renderPort.release(),
  ])
  if (created)
    compose('exec', '-T', 'db', 'dropdb', '-U', 'orbit', '--force', database)
  await rm(assets, { recursive: true, force: true })
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'api.log'), logs.api)
  await writeFile(join(output, 'renderer.log'), logs.renderer)
}
