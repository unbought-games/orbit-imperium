import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve(
  process.env.LIVERY_CAPTURE_DIR ??
    'tools/ship-livery/output/finish/verification',
)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true }),
  start = performance.now()
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:52691/finish.html')
  await page.locator('canvas[data-ready=true]').waitFor()
  await page.context().setOffline(true)
  const bytes = () => page.locator('canvas').evaluate((c) => c.toDataURL()),
    times = []
  for (const name of [
    'Navy / Gold',
    'Rose / Platinum',
    'Porcelain / Rose gold',
    'Cobalt / Titanium',
    'Scarlet / Graphite',
    'Obsidian / Copper',
  ]) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.locator('#livery-name')).toHaveText(name)
    times.push(
      Number(await page.locator('canvas').getAttribute('data-render-ms')),
    )
  }
  await page
    .getByRole('button', { name: 'Rose / Platinum', exact: true })
    .click()
  const rose = await bytes()
  await page.screenshot({ path: `${output}/rose-desktop-1440x1000.png` })
  for (const [label, value] of [
    ['Primary', '#8432a8'],
    ['Accent', '#edc186'],
  ]) {
    const before = await bytes()
    await page.getByLabel(label, { exact: true }).fill(value)
    expect(await bytes()).not.toBe(before)
  }
  await page
    .getByRole('button', { name: 'Rose / Platinum', exact: true })
    .focus()
  await page.keyboard.press('Enter')
  expect(await bytes()).toBe(rose)
  for (const mode of ['gray', 'previous', 'reference', 'debug', 'finished']) {
    await page.getByLabel('Compare the process').selectOption(mode)
    await expect(page.locator('canvas')).toHaveAttribute('data-mode', mode)
    if (mode === 'gray')
      await page.screenshot({
        path: `${output}/gray-source-desktop-1440x1000.png`,
      })
    if (mode === 'finished') expect(await bytes()).toBe(rose)
  }
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export transparent PNG' }).click()
  await (await download).saveAs(`${output}/browser-rose.png`)
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('button', { name: 'Porcelain / Rose gold', exact: true })
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: `${output}/pearl-mobile-390x844.png`,
    fullPage: true,
  })
  await page.context().setOffline(false)
  const failure = await browser.newPage()
  await failure.route('**/response-map.png', (route) => route.abort())
  await failure.goto('http://127.0.0.1:52691/finish.html')
  await expect(failure.getByRole('status')).toContainText('could not load')
  await expect(
    failure.getByRole('button', { name: 'Export transparent PNG' }),
  ).toBeDisabled()
  expect(errors).toEqual([])
  const report = {
    checks: [
      'six palettes',
      'primary/accent',
      'keyboard activation',
      'all five comparison modes',
      'palette retained across methods',
      'PNG export',
      'desktop/mobile overflow',
      'load failure',
      'all edits and export with browser offline',
    ],
    pageErrors: errors,
    renderMilliseconds: times,
    seconds: (performance.now() - start) / 1000,
  }
  await writeFile(
    `${output}/browser-verification.json`,
    JSON.stringify(report, null, 2) + '\n',
  )
  console.log(report)
} finally {
  await browser.close()
}
