// Explicit local browser acceptance. Run against art:livery:concepts:preview.
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve(
  process.env.LIVERY_CAPTURE_DIR ??
    'tools/ship-livery/output/concepts/verification',
)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true }),
  started = performance.now()
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:52681/concepts.html')
  await page.locator('canvas[data-ready=true]').waitFor()
  const bytes = () => page.locator('canvas').evaluate((c) => c.toDataURL())
  for (const name of ['Rupture', 'Concord']) {
    await page.getByRole('button', { name: new RegExp(`/ ${name}$`) }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await page
      .getByRole('button', { name: 'Graphite / Brass', exact: true })
      .click()
    for (const palette of [
      'Pearl / Aubergine',
      'Copper / Petrol',
      'Graphite / Brass',
    ])
      await page.getByRole('button', { name: palette, exact: true }).click()
    const original = await bytes()
    for (const [label, color] of [
      ['Primary', '#693cb2'],
      ['Accent', '#e3ad38'],
    ]) {
      const before = await bytes()
      await page.getByLabel(label, { exact: true }).fill(color)
      expect(await bytes()).not.toBe(before)
    }
    await page
      .getByRole('button', {
        name: name === 'Rupture' ? '/ Concord' : '/ Rupture',
      })
      .click()
    await expect(page.getByLabel('Primary', { exact: true })).toHaveValue(
      '#693cb2',
    )
    await page.getByRole('button', { name: new RegExp(`/ ${name}$`) }).click()
    await expect(page.getByLabel('Accent', { exact: true })).toHaveValue(
      '#e3ad38',
    )
    for (const markings of ['chevron', 'bands', 'none'])
      await page
        .getByRole('combobox', { name: 'Markings' })
        .selectOption(markings)
    for (const view of ['original', 'debug', 'livery']) {
      await page
        .getByRole('combobox', { name: 'View', exact: true })
        .selectOption(view)
      await expect(page.locator('.mask-key')).toBeVisible({
        visible: view === 'debug',
      })
    }
    await page
      .getByRole('button', { name: 'Graphite / Brass', exact: true })
      .focus()
    await page.keyboard.press('Enter')
    expect(await bytes()).toBe(original)
    await page.screenshot({
      path: `${output}/${name.toLowerCase()}-desktop-1440x1000.png`,
    })
    await page
      .getByRole('button', { name: 'Copper / Petrol', exact: true })
      .click()
    await page
      .getByRole('combobox', { name: 'Markings' })
      .selectOption('chevron')
    await page.screenshot({
      path: `${output}/${name.toLowerCase()}-markings-desktop-1440x1000.png`,
    })
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export this fighter' }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe(
      `${name.toLowerCase()}-v1-livery.png`,
    )
    await download.saveAs(`${output}/${download.suggestedFilename()}`)
    await page.getByRole('combobox', { name: 'Markings' }).selectOption('none')
    await page
      .getByRole('button', { name: 'Graphite / Brass', exact: true })
      .click()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ['Rupture', 'Concord']) {
    await page.getByRole('button', { name: new RegExp(`/ ${name}$`) }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `${output}/${name.toLowerCase()}-mobile-390x844.png`,
      fullPage: true,
    })
  }
  const failure = await browser.newPage()
  await failure.route('**/concord-v1/mask.png', (route) => route.abort())
  await failure.goto('http://127.0.0.1:52681/concepts.html')
  await expect(failure.getByRole('status')).toContainText('could not load')
  await expect(
    failure.getByRole('button', { name: 'Export this fighter' }),
  ).toBeDisabled()
  expect(errors).toEqual([])
  const result = {
    checks: [
      'both hulls',
      'primary/accent input',
      'palette retained across hull switches',
      'all three palettes',
      'markings',
      'neutral/mask/livery views',
      'keyboard activation',
      'PNG exports',
      'desktop/mobile layout',
      'load failure',
    ],
    pageErrors: errors,
    seconds: (performance.now() - started) / 1000,
  }
  await writeFile(
    `${output}/browser-verification.json`,
    JSON.stringify(result, null, 2) + '\n',
  )
  console.log(result)
} finally {
  await browser.close()
}
