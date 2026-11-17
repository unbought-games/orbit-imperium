import sharp from 'sharp'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { paintEmblems } from './emblem-render.mjs'
import { compileDecalResponse } from './emblem-authoring.mjs'
const root = new URL('./', import.meta.url),
  out = new URL('output/emblems/', root)
await mkdir(out, { recursive: true })
const hash = (b) => createHash('sha256').update(b).digest('hex')
const config = JSON.parse(
  await readFile(new URL('concord-emblems-v1/slots.json', root)),
)
if (
  hash(
    await readFile(new URL('concord-finish-v2/finished-master.png', root)),
  ) !== config.masterSha256
)
  throw Error('Master changed; reauthor slots')
const server = await createServer({
  configFile: new URL('emblem-vite.config.mjs', root).pathname,
})
await server.listen()
const browser = await chromium.launch({ headless: true })
const errors = []
const raw = async (path) => sharp(path).ensureAlpha().raw().toBuffer()
const save = async (name, data) =>
  sharp(data, {
    raw: { width: config.width, height: config.height, channels: 4 },
  })
    .png()
    .toFile(new URL(name + '.png', out).pathname)
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  page.on('pageerror', (e) => errors.push(e.message))
  const failed = []
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
  })
  await page.goto(
    'http://127.0.0.1:52701/tools/ship-livery/emblems.html?capture=1',
  )
  await page.locator('[data-texture]').first().waitFor()
  // CSS masks are not HTML images: explicitly establish successful asset delivery before capture.
  await page.evaluate(async () => {
    const urls = [...document.querySelectorAll('[data-texture] span')]
      .map((el) => getComputedStyle(el).maskImage)
      .filter((v) => v.startsWith('url('))
      .map((v) => v.slice(5, -2))
    await Promise.all(
      [...new Set(urls)].map(
        (url) =>
          new Promise((resolve, reject) => {
            const i = new Image()
            i.onload = resolve
            i.onerror = reject
            i.src = url
          }),
      ),
    )
  })
  for (const element of await page.locator('[data-texture]').all())
    await element.screenshot({
      path: new URL(`${await element.getAttribute('data-texture')}.png`, out)
        .pathname,
      omitBackground: true,
    })
  const recipes = await page.evaluate(
    async () => (await import('/tools/ship-livery/emblem-fixtures.ts')).emblems,
  )
  const material = await raw(
    new URL('output/finish/material-mask.png', root).pathname,
  )
  const baseResponse = await raw(
    new URL('output/finish/response-map.png', root).pathname,
  )
  const source = await raw(
    new URL('concord-finish-v2/finished-master.png', root).pathname,
  )
  const response = await compileDecalResponse(
    source,
    baseResponse,
    config.width,
    config.height,
  )
  await save('decal-response', response)
  const receiver = await raw(
    Buffer.from(
      await readFile(new URL('concord-emblems-v1/receiver.svg', root)),
    ),
  )
  for (let p = 0; p < receiver.length; p += 4)
    receiver[p + 3] = Math.round(
      (((receiver[p] / 255) * receiver[p + 3] * material[p + 3]) / 255) *
        (1 - material[p + 1] / 255),
    )
  await save('receiver', receiver)
  for (const item of recipes)
    for (const mode of ['full', 'layers']) {
      const texturePath = new URL(`${item.id}-${mode}.png`, out).pathname
      const { width, height } = await sharp(texturePath).metadata()
      const texture = { pixels: await raw(texturePath), width, height }
      for (const palette of ['navy', 'rose', 'pearl', 'midnight']) {
        const hull = await raw(
          new URL(`output/finish/${palette}.png`, root).pathname,
        )
        for (const placement of ['single', 'paired'])
          await save(
            `${item.id}-${palette}-${mode}-${placement}`,
            paintEmblems(
              hull,
              texture,
              {
                ...config,
                slots:
                  placement === 'single'
                    ? config.slots.slice(0, 1)
                    : config.slots,
              },
              receiver,
              response,
            ),
          )
        if (item.id === 'crown' && palette === 'navy' && mode === 'layers') {
          await save(
            'flat-comparison',
            paintEmblems(hull, texture, config, receiver, response, {
              flat: true,
            }),
          )
          await save(
            'response-only-comparison',
            paintEmblems(hull, texture, config, receiver, baseResponse),
          )
          for (const scale of [0.75, 1.25]) {
            const slots = config.slots.map((slot) => {
              const center = [0, 1].map(
                (c) => slot.quad.reduce((sum, p) => sum + p[c], 0) / 4,
              )
              return {
                ...slot,
                quad: slot.quad.map((p) =>
                  p.map((v, c) => center[c] + (v - center[c]) * scale),
                ),
              }
            })
            await save(
              `size-${scale}`,
              paintEmblems(
                hull,
                texture,
                { ...config, slots },
                receiver,
                response,
              ),
            )
          }
        }
      }
    }
  await writeFile(
    new URL('recipes.json', out),
    JSON.stringify(recipes, null, 2) + '\n',
  )
  await page.goto('http://127.0.0.1:52701/tools/ship-livery/emblems.html')
  await page.locator('.stage img').evaluate((img) => img.decode())
  await page.screenshot({
    path: new URL('desktop-1440x1000.png', out).pathname,
    fullPage: true,
  })
  // Every preview combination must load; no fabricated readiness based on navigation alone.
  for (const id of ['crown', 'starwing', 'helix', 'ascendant']) {
    await page.getByLabel('Empire insignia').selectOption(id)
    for (const mode of ['full', 'layers']) {
      await page.getByLabel('Emblem treatment').selectOption(mode)
      await page.locator('.stage img').evaluate((img) => img.decode())
    }
  }
  await page.getByLabel('Placement', { exact: true }).selectOption('single')
  await page.locator('.stage img').evaluate((img) => img.decode())
  await page.getByLabel('Placement', { exact: true }).selectOption('paired')
  await page.getByLabel('Hull palette').selectOption('pearl')
  await page.getByLabel('Empire insignia').selectOption('starwing')
  await page.getByLabel('Emblem treatment').selectOption('full')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.stage img').evaluate((img) => img.decode())
  await page.screenshot({
    path: new URL('mobile-390x844.png', out).pathname,
    fullPage: true,
  })
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw Error('Mobile overflow')
  if (errors.length || failed.length)
    throw Error(JSON.stringify({ errors, failed }))
  await writeFile(
    new URL('browser-verification.json', out),
    JSON.stringify(
      {
        errors,
        failed,
        viewportChecks: [
          [1440, 1000],
          [390, 844],
        ],
        browser: browser.version(),
      },
      null,
      2,
    ),
  )
  console.log(
    'Rendered 64 ship variants from actual game insignias; desktop/mobile captures saved.',
  )
} finally {
  await browser.close()
  await server.close()
}
