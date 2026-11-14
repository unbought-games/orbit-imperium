import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixture'
import type {} from './resources.scenarios'

async function open(page: Page, params: Record<string, string> = {}) {
  await page.goto(
    '/?' + new URLSearchParams({ scenario: 'resources', ...params }),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
}

// Mobile generated labels must distinguish ship quantities from building levels.
test('satellite quantity labels preserve the output slider across mobile and desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1200 })
  await open(page, { page: 'production' })
  await page.evaluate(async () => {
    const scene = window.resourceScene
    scene.view.bodies[0].inventories.push({
      item: { kind: 'Ship', id: 'SolarSatellite' },
      count: '8',
    })
    const production = scene.view.progression.production[0]
    production.editable.push('solar_satellite')
    production.solar_satellite = {
      energy_supply: '216000000',
      unit_energy: '27000000',
    }
    await scene.refresh()
  })
  const satellite = page.getByRole('row', { name: /Solar Satellite/ })
  const quantity = satellite.getByRole('cell').first()
  const level = page
    .getByRole('row', { name: /Solar Plant/ })
    .getByRole('cell')
    .first()
  const slider = satellite.getByRole('slider')
  await expect(quantity).toHaveText('8')
  expect(
    await quantity.evaluate((el) => getComputedStyle(el, '::before').content),
  ).toBe('"Qty "')
  expect(
    await level.evaluate((el) => getComputedStyle(el, '::before').content),
  ).toBe('"Lv "')
  await expect(slider).toHaveCount(1)
  await expect(slider).toHaveValue('100')
  await diagnosticScreenshot(page, {
    path: 'test-results/satellite-production-mobile-390x1200.png',
  })
  await slider.press('ArrowLeft')
  await expect(slider).toHaveValue('90')
  await expect(slider).toHaveAttribute('aria-valuetext', '90%')
  await expect(page.getByRole('status')).toHaveText(
    'All changes saved automatically.',
  )
  await expect(quantity).toHaveText('8')
  expect(
    await page.evaluate(() => window.resourceScene.sent.map((e) => e.command)),
  ).toMatchObject([
    { type: 'SetProduction', settings: { solar_satellite: 90 } },
  ])
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: 'test-results/satellite-production-mobile-output-90-390x1200.png',
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(
    page.getByRole('columnheader', { name: 'Level / quantity' }),
  ).toBeVisible()
  expect(
    await quantity.evaluate((el) => getComputedStyle(el, '::before').content),
  ).toBe('none')
  await expect(quantity).toHaveText('8')
  await expect(slider).toHaveValue('90')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: 'test-results/satellite-production-desktop-1440x1000.png',
  })
})

// Native pointer/keyboard geometry belongs here; HTTP, history and storage
// restoration remain in resources.spec.ts.
test('production sliders support mouse, keyboard bounds and final saves', async ({
  page,
}) => {
  await open(page, { page: 'production' })
  const metal = page.getByRole('slider', { name: 'metal mine production' })
  const status = page.getByRole('status')
  await expect(metal).toHaveAttribute('step', '10')
  await metal.focus()
  await metal.press('Home')
  await expect(metal).toHaveValue('0')
  await expect(metal).toHaveAttribute('aria-valuetext', '0%')
  await expect(status).toHaveText('All changes saved automatically.')
  expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(1)
  await metal.press('ArrowLeft')
  await expect(metal).toHaveValue('0')
  await metal.press('End')
  await expect(metal).toHaveValue('100')
  await expect(status).toHaveText('All changes saved automatically.')
  expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(2)
  await metal.press('ArrowRight')
  await expect(metal).toHaveValue('100')
  const box = (await metal.boundingBox())!
  await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 5,
  })
  await page.mouse.up()
  await expect(metal).toHaveValue('50')
  await expect(status).toHaveText('All changes saved automatically.')
  expect(
    await page.evaluate(() => window.resourceScene.sent.map((e) => e.command)),
  ).toMatchObject([
    { type: 'SetProduction', settings: { metal_mine: 0 } },
    { type: 'SetProduction', settings: { metal_mine: 100 } },
    { type: 'SetProduction', settings: { metal_mine: 50 } },
  ])
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    for (const percentage of await page.locator('input + span').all()) {
      expect(
        await percentage.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          return new Set(Array.from(range.getClientRects(), (rect) => rect.top))
            .size
        }),
      ).toBe(1)
    }
  }
})

test('unedited production controls follow saved settings and retain rules and fuel details', async ({
  page,
}) => {
  await open(page, { page: 'production' })
  const settings = page.getByRole('region', { name: 'Production controls' })
  await expect(settings.getByRole('slider')).toHaveCount(4)
  await expect(page.getByLabel('metal mine production')).toHaveValue('100')
  await page.evaluate(async () => {
    const scene = window.resourceScene
    scene.view.progression.production[0].settings.metal_mine = 70
    scene.view.progression.production[0].settings_revision = '2'
    await scene.refresh()
  })
  await expect(page.getByLabel('metal mine production')).toHaveValue('70')
  await expect(
    page.getByRole('button', { name: 'Use current revision for this draft' }),
  ).toHaveCount(0)
  await settings
    .getByText('Production rules and unavailable sources', { exact: true })
    .click()
  await expect(
    settings.getByText('Unavailable: Fusion Reactor, Solar Satellite.'),
  ).toBeVisible()
  await expect(settings).toContainText('Deuterium fuel: 0 / hour')
  await expect(settings).toContainText('Net deuterium: 10 / hour')
  await expect(settings).toContainText(
    'Full storage suppresses new income; fuel consumption continues and excess resources remain usable.',
  )
  await expect(settings).toContainText(
    'Energy and fuel shortages reduce output without changing your settings.',
  )
  for (const copy of [
    'Confirmed economy',
    'output · energy demand',
    'Save applies all settings',
  ])
    await expect(settings).not.toContainText(copy)
})

test('production shows saving, retains rejected edits and retries against current settings', async ({
  page,
}) => {
  await open(page, { page: 'production' })
  await page.evaluate(() => {
    window.resourceScene.hold()
    window.resourceScene.reject(true)
  })
  const metal = page.getByRole('slider', { name: 'metal mine production' })
  await metal.press('Home')
  await expect(page.getByRole('status')).toHaveText(
    'Saving production changes… Totals show confirmed settings.',
  )
  await expect(metal).toHaveValue('0')
  await page.evaluate(() => window.resourceScene.release())
  const error = page.getByRole('group', { name: 'Production settings error' })
  await expect(error.getByRole('alert')).toBeVisible()
  await expect(metal).toHaveValue('0')
  await page.evaluate(() => {
    const scene = window.resourceScene
    scene.reject(false)
    scene.view.progression.production[0].settings.crystal_mine = 60
    scene.view.progression.production[0].settings_revision = '2'
  })
  await error.getByRole('button', { name: 'Retry production changes' }).click()
  await expect(page.getByRole('status')).toHaveText(
    'All changes saved automatically.',
  )
  await expect(page.getByLabel('crystal mine production')).toHaveValue('60')
  await expect(metal).toHaveValue('0')
  await expect(error).toHaveCount(0)
})

for (const width of [320, 390, 1440]) {
  test(`quick build stays inside the row with keyboard and touch-sized controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await open(page)
    const row = page.getByRole('link', {
      name: 'Upgrade Metal Mine',
      exact: true,
    })
    const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    await expect(build).toBeEnabled()
    await row.focus()
    await page.keyboard.press('Tab')
    await expect(build).toBeFocused()
    const box = (await build.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await expect(build).toHaveText('')
    await expect(build).toHaveAccessibleName('Build Metal Mine level 2')
    await expect(build).toHaveAttribute('title', 'Build Metal Mine level 2')
    await expect(build).toHaveAttribute('data-button-variant', 'ghost')
    await expect(
      page.getByRole('button', { name: /build details/ }),
    ).toHaveCount(0)
    const rowBox = (await row.boundingBox())!
    expect(box.x).toBeGreaterThan(rowBox.x)
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width)
    expect(box.y).toBeGreaterThanOrEqual(rowBox.y)
    expect(box.y + box.height).toBeLessThanOrEqual(rowBox.y + rowBox.height)
    await expect(row.getByRole('button')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Upgrade Crystal Mine', exact: true }),
    ).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await row.click({ position: { x: rowBox.width - 3, y: rowBox.height / 2 } })
    await expect(
      page.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
  })
}

test('server restrictions disable quick build while details remain inspectable', async ({
  page,
}) => {
  await open(page, { mode: 'blocked' })
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine level 2' }),
  ).toBeDisabled()
  await page
    .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await expect(page.getByLabel('Action blockers')).toContainText(
    'No Free Field',
  )
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})

test('level zero buildings offer upgrades without a tear-down option', async ({
  page,
}) => {
  await open(page, { item: 'DeuteriumSynthesizer' })
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(quote).not.toContainText('No Deuterium Synthesizer')
  await expect(
    quote.getByRole('heading', { name: 'First Build', exact: true }),
  ).toBeVisible()
  await expect(quote.getByLabel('Current level and benefit')).toHaveCount(0)
  await expect(
    quote.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeVisible()
  await expect(
    quote.getByRole('button', { name: 'Demolish Deuterium Synthesizer' }),
  ).toHaveCount(0)
})

test('resource cost images expose live details on hover and keyboard focus', async ({
  page,
}) => {
  await open(page, { item: 'MetalMine', mode: 'poor' })
  const metal = page
    .getByLabel('Required resources')
    .getByRole('button', { name: 'Metal details' })
  await expect(metal).toHaveAccessibleName('Metal details')
  await expect(metal.getByText('Metal', { exact: true })).toHaveCount(0)
  await expect(metal.locator('svg')).toBeVisible()
  await expect(metal.getByText('60', { exact: true })).toBeVisible()
  await expect(metal.locator('svg')).toHaveCSS('color', 'rgb(203, 182, 141)')
  await expect(metal.getByText('60', { exact: true })).toHaveCSS(
    'color',
    'rgb(244, 234, 210)',
  )
  await metal.hover()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  for (const text of ['Required 60', 'Available 0', 'Shortfall 60'])
    await expect(details).toContainText(text)
  await page.evaluate(async () => {
    window.resourceScene.view.bodies[0].amounts.metal = '60000000'
    await window.resourceScene.refresh()
  })
  await expect(details).toContainText('Available 60')
  await expect(details).not.toContainText('Shortfall')
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeEnabled()
  const back = page.getByRole('link', { name: /^Back to / })
  await back.focus()
  await expect(back).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(metal).toBeFocused()
  await expect(details).toBeVisible()
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})

test.describe('independent touch controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('resource cost details open by tap and fit a phone viewport', async ({
    page,
  }) => {
    await open(page, { item: 'MetalMine' })
    await page
      .getByLabel('Required resources')
      .getByRole('button', { name: 'Crystal details' })
      .tap()
    const details = page.getByRole('dialog', { name: 'Crystal', exact: true })
    await expect(details).toContainText('Required 15')
    await expect(details).toContainText('Available 9,420')
    const bounds = (await details.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
  })
})
for (const width of [320, 390, 1440]) {
  test(`building quotes distinguish energy and show consistent shortages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await open(page, { mode: 'building' })
    await page
      .getByRole('link', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).not.toContainText('Construction energy required')
    await expect(pane).not.toContainText('Extra operating energy')
    await expect(pane.locator('dl')).toContainText(
      /Energy after upgrade13\s*\(-14\)/,
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await diagnosticScreenshot(page, {
      path: `test-results/building-energy-${width}.png`,
    })
    await pane
      .getByRole('button', { name: 'Demolish Crystal Mine', exact: true })
      .click()
    await expect(pane.locator('dl')).toContainText(
      /Energy after demolition37\s*\(\+11\)/,
    )
    await expect(pane).not.toContainText('Operating energy saved')
    await open(page, { mode: 'building', page: 'facilities' })
    await page
      .getByRole('link', { name: 'Upgrade Research Lab', exact: true })
      .click()
    await expect(pane.getByRole('button', { name: /Demolish/ })).toHaveCount(0)
    const row = pane.getByRole('group', { name: 'Required resources' })
    await expect(row).toContainText('200')
    await row
      .getByRole('button', { name: 'Deuterium details', exact: true })
      .click()
    await expect(
      page.getByRole('dialog', { name: 'Deuterium', exact: true }),
    ).toContainText('182')
    await page.keyboard.press('Escape')
    await expect(pane.getByLabel('Missing resources')).toContainText(
      /Missing\s*18/,
    )
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeDisabled()
    await expect(pane.locator('dl')).not.toContainText('Extra operating energy')
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
      await row.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/building-quote-${width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [320, 390, 1440]) {
  test(`storage details show cost before benefits and build action at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await open(page, { mode: 'building' })
    await page
      .getByRole('link', { name: 'Upgrade Metal Storage', exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const current = pane.getByLabel('Current level and benefit')
    const target = pane.getByLabel('Target level and benefit')
    await expect(current).toHaveCount(0)
    await expect(
      target.getByText('No Metal Storage', { exact: true }),
    ).toHaveCount(0)
    const firstBuild = target.getByRole('heading', {
      name: 'First Build',
      exact: true,
    })
    await expect(firstBuild).toBeVisible()
    await expect(target.locator(':scope > :first-child')).toHaveText(
      'First Build',
    )
    await expect(target).toContainText('Metal capacity')
    await expect(target).toContainText('20,000')
    const button = target.getByRole('button', { name: 'Confirm upgrade' })
    await expect(button).toHaveText('Build Metal Storage')
    const cost = pane.getByRole('group', { name: 'Required resources' })
    await expect(
      cost.getByRole('button', { name: 'Deuterium details' }),
    ).toHaveCount(0)
    await expect(pane.getByRole('table')).toHaveCount(0)
    await expect(
      pane.getByRole('region', { name: 'Building requirements' }),
    ).toHaveCount(0)
    await expect(pane).not.toContainText('Construction possible')
    await expect(target.locator('dl > div').first()).toContainText('Build cost')
    const benefit = target
      .locator('dl > div')
      .filter({ has: page.getByText('Metal capacity', { exact: true }) })
    // Read every rectangle in the same browser task: route-focus scrolling
    // between separate boundingBox calls can mix viewport coordinate systems.
    const [headingBox, targetBox, costBox, benefitBox, buttonBox] =
      await page.evaluate(
        (elements) =>
          elements.map((element) => {
            if (!element) throw new Error('Missing storage layout element')
            const { y, height } = element.getBoundingClientRect()
            return { y, height }
          }),
        await Promise.all(
          [firstBuild, target, cost, benefit, button].map((locator) =>
            locator.elementHandle(),
          ),
        ),
      )
    expect(costBox.y).toBeGreaterThanOrEqual(targetBox.y)
    expect(headingBox.y).toBe(targetBox.y)
    expect(headingBox.y + headingBox.height).toBeLessThan(costBox.y)
    expect(costBox.y + costBox.height).toBeLessThanOrEqual(benefitBox.y)
    expect(buttonBox.y).toBeGreaterThanOrEqual(benefitBox.y + benefitBox.height)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(pane, {
      path: `test-results/storage-detail-${width}.png`,
    })
    await pane.getByRole('link', { name: /^Back to / }).click()
    await page
      .getByRole('link', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    // Planet totals include the 15/h base production in the complete snapshot.
    await expect(current).toContainText('37 / h')
    await expect(target).toContainText('63 / h')
    const teardown = pane.getByRole('button', { name: 'Demolish Crystal Mine' })
    expect((await teardown.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await target
        .getByRole('button', { name: 'Confirm upgrade' })
        .boundingBox())!.y,
    )
  })
}

// Authoritative server projections deliberately differ from rated output and
// from current live output, so swapping any of them is observable.
for (const width of [390, 1440]) {
  for (const scenario of [
    'fusion-first',
    'fusion-fuel-limited',
    'crystal-active',
    'crystal-demolition',
  ] as const) {
    test(`${scenario} preserves the target forecast at ${width}px`, async ({
      page,
    }) => {
      const height = width === 390 ? 844 : 1000
      await page.setViewportSize({ width, height })
      const fusion = scenario.startsWith('fusion')
      const limited = scenario === 'fusion-fuel-limited'
      const demolition = scenario === 'crystal-demolition'
      const targetLevel = fusion ? 1 : demolition ? 12 : 14
      await open(page, {
        forecast: scenario,
        item: fusion ? 'FusionReactor' : 'CrystalMine',
      })
      const section = fusion
        ? page.getByLabel('Target level and benefit')
        : page.getByRole('region', { name: 'Active construction', exact: true })
      const energyLabel = fusion
        ? 'Energy after build'
        : demolition
          ? 'Energy after demolition'
          : 'Energy after upgrade'
      const energy = section.getByRole('button', {
        name: `${energyLabel} details`,
        exact: true,
      })
      await expect(energy).toHaveText(
        fusion
          ? limited
            ? '-26 (+8)'
            : '-2 (+32)'
          : demolition
            ? '-4 (+30)'
            : '-117 (-83)',
      )
      if (fusion) {
        const output = section
          .locator('dl > div')
          .filter({ has: page.getByText('Energy supplied', { exact: true }) })
        await expect(
          output.getByTitle('New total', { exact: true }),
        ).toHaveText(limited ? '8' : '32')
        await expect(
          section.locator('dl > div').filter({
            has: page.getByText('Deuterium fuel / hour', { exact: true }),
          }),
        ).toHaveText(limited ? /0 → 8/ : /0 → 33/)
      } else {
        await expect(section.getByRole('heading')).toHaveText(
          `${demolition ? 'Tearing down' : 'Upgrading'} to level ${targetLevel}`,
        )
        const output = section
          .locator('dl > div')
          .filter({ has: page.getByText('Planet output', { exact: true }) })
        await expect(
          output.getByTitle('Current output', { exact: true }),
        ).toHaveText('2,689 / h')
        await expect(
          output.getByTitle('New total', { exact: true }),
        ).toHaveText(demolition ? '2,400 / h' : '3,045 / h')
        await expect(
          page.getByLabel('Current level and benefit'),
        ).toContainText('Level 13')
        await expect(
          page.getByLabel('Current level and benefit'),
        ).toContainText('2,689 / h')
        await expect(
          section.getByRole('button', { name: 'Completion time details' }),
        ).toHaveText('50m')
        await expect(
          section.getByRole('button', {
            name: 'Cancel construction',
            exact: true,
          }),
        ).toBeEnabled()
        await expect(
          page.getByRole('button', { name: 'Confirm upgrade', exact: true }),
        ).toHaveCount(0)
        expect(
          await page.evaluate(() => window.resourceScene.requests.at(-1)?.type),
        ).toBe(demolition ? 'Demolition' : 'Upgrade')
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/${scenario}-${width}x${height}.png`,
      })
      await energy.click()
      const details = page.getByRole('dialog', {
        name: energyLabel,
        exact: true,
      })
      await expect(details).toContainText('Current balance: -34')
      await expect(details).toContainText(
        `Production efficiency: ${fusion ? (limited ? '98' : '99') : demolition ? '99' : '94'}%`,
      )
      await diagnosticScreenshot(page, {
        path: `test-results/${scenario}-energy-details-${width}x${height}.png`,
        fullPage: false,
      })
      await page.keyboard.press('Escape')
      if (!fusion) {
        await section
          .getByRole('button', { name: 'Cancel construction', exact: true })
          .click()
        await expect(
          page.getByRole('dialog', {
            name: 'Cancel construction?',
            exact: true,
          }),
        ).toContainText(`Crystal Mine to level ${targetLevel}`)
        await diagnosticScreenshot(page, {
          path: `test-results/${scenario}-cancel-${width}x${height}.png`,
          fullPage: false,
        })
        await page.keyboard.press('Escape')
        await expect(energy).toBeVisible()
        await page.evaluate(async (target) => {
          const scene = window.resourceScene
          scene.view.constructions = []
          scene.view.bodies[0].levels.CrystalMine = target
          await scene.refresh()
        }, targetLevel)
        await expect(section).toHaveCount(0)
        await expect(
          page.getByLabel('Current level and benefit'),
        ).toContainText(`Level ${targetLevel}`)
        await expect(
          page.getByRole('heading', {
            name: `Next · level ${targetLevel + 1}`,
            exact: true,
          }),
        ).toBeVisible()
      }
    })
  }
}

test('a pending building quote labels its disabled action as loading', async ({
  page,
}) => {
  await open(page, { item: 'MetalMine', mode: 'loading' })
  const action = page.getByRole('button', {
    name: 'Confirm upgrade',
    exact: true,
  })
  await expect(action).toBeDisabled()
  await expect(action).toHaveText('Loading…')
  await page.evaluate(() => window.resourceScene.releaseOptions())
  await expect(action).toBeEnabled()
  await expect(action).toHaveText('Build level 2')
})

test('live affordability reaches tiles and open quotes without reinspection; changed levels refresh terms', async ({
  page,
}) => {
  await open(page, { mode: 'poor' })
  const tile = page.getByRole('link', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  await expect(tile).toBeEnabled()
  await tile.click()
  const confirm = page.getByRole('button', { name: 'Confirm upgrade' })
  await expect(confirm).toBeDisabled()
  await expect(
    page
      .getByLabel('Missing resources')
      .getByRole('img', { name: 'metal', exact: true }),
  ).toBeVisible()
  const before = await page.evaluate(() => window.resourceScene.queries())
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.metal = '60000000'
    await s.refresh()
  })
  await expect(confirm).toBeEnabled()
  await expect(page.getByLabel('Action blockers')).toHaveCount(0)
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.crystal = '14999999'
    await s.refresh()
  })
  await expect(confirm).toBeDisabled()
  await expect(
    page
      .getByLabel('Missing resources')
      .getByRole('img', { name: 'crystal', exact: true }),
  ).toBeVisible()
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.crystal = '15000000'
    await s.refresh()
  })
  await expect(confirm).toBeEnabled()
  expect(await page.evaluate(() => window.resourceScene.queries())).toBe(before)
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(
    quote.getByText('Requirements & construction terms', { exact: true }),
  ).toHaveCount(0)
  await expect(
    quote.getByText('Full refund if cancelled before completion.', {
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(quote).not.toContainText('A quote reserves nothing')
  await expect(confirm).toHaveText('Build level 2')
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].levels.MetalMine = 2
    await s.refresh()
  })
  await expect(confirm).toHaveText('Build level 3')
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(tile).not.toHaveAttribute('title', /Not enough resources/)
  await tile.click()
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.metal = '59999999'
    await s.refresh()
  })
  await expect(confirm).toBeDisabled()
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})

for (const width of [390, 1440]) {
  test(`background metadata refresh preserves building details and focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, { item: 'CrystalMine' })
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const build = page.getByRole('button', {
      name: 'Confirm upgrade',
      exact: true,
    })
    await expect(build).toBeEnabled()
    await expect(pane).toBeFocused()
    await build.focus()
    const before = await page.evaluate(() => window.resourceScene.queries())
    await page.evaluate(async () => {
      const s = window.resourceScene
      s.failInspection(true)
      s.view.bodies[0].name = 'Renamed from another session'
      await s.refresh()
    })
    await expect(build).toBeEnabled()
    await expect(build).toHaveText('Build level 2')
    await expect(build).toBeFocused()
    await expect(
      page.getByText('Loading building details…', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Demolish Crystal Mine', exact: true }),
    ).toBeEnabled()
    expect(await page.evaluate(() => window.resourceScene.queries())).toBe(
      before,
    )
    await page.evaluate(async () => {
      const s = window.resourceScene
      s.view.bodies[0].amounts = { metal: '0', crystal: '0', deuterium: '0' }
      await s.refresh()
    })
    await expect(build).toBeDisabled()
    await expect(build).toHaveText('Build level 2')
    expect(await page.evaluate(() => window.resourceScene.queries())).toBe(
      before,
    )
  })
  test(`active forecast failure preserves cancellation and retries at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, {
      item: 'CrystalMine',
      forecast: 'crystal-active',
      mode: 'failed',
    })
    const active = page.getByRole('region', {
      name: 'Active construction',
      exact: true,
    })
    await expect(active.getByRole('alert')).toContainText(
      'Unable to inspect this action',
    )
    await expect(
      active.getByRole('button', { name: 'Cancel construction', exact: true }),
    ).toBeEnabled()
    await expect(
      active.getByRole('button', {
        name: 'Completion time details',
        exact: true,
      }),
    ).toBeVisible()
    await page.evaluate(() => window.resourceScene.failInspection(false))
    await active.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(active.getByRole('alert')).toHaveCount(0)
    await expect(
      active.getByRole('button', {
        name: 'Energy after upgrade details',
        exact: true,
      }),
    ).toBeVisible()
  })
}

test('fractional balances stay whole in the ledger and tooltip without enabling an unaffordable upgrade', async ({
  page,
}) => {
  await open(page, { item: 'MetalMine' })
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts = {
      metal: '59999999',
      crystal: '864661927',
      deuterium: '0',
    }
    await s.refresh()
  })
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const costs = pane.getByRole('group', { name: 'Required resources' })
  await expect(pane.getByLabel('Missing resources')).toContainText(
    /Missing\s*1/,
  )
  await costs.getByRole('button', { name: 'Crystal details' }).click()
  const crystal = page.getByRole('dialog', { name: 'Crystal', exact: true })
  await expect(crystal).toContainText('Available 864')
  await expect(crystal).toContainText('After spending 849')
  await page.keyboard.press('Escape')
  await expect(
    pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  ).toBeDisabled()
  await costs.getByRole('button', { name: 'Metal details' }).click()
  const metal = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(metal).toContainText('Available 59')
  await expect(metal).toContainText('Shortfall 1')
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})

for (const width of [390, 1440]) {
  test(`active storage retains its capacity benefit at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await open(page, {
      mode: 'building',
      active: 'storage',
      item: 'MetalStorage',
    })
    const active = page.getByRole('region', {
      name: 'Active construction',
      exact: true,
    })
    await expect(active.getByRole('heading')).toHaveText('Upgrading to level 1')
    await expect(active.getByTitle('New total', { exact: true })).toHaveText(
      '20,000',
    )
  })
}

for (const kind of ['construction', 'research'] as const) {
  test(`${kind} cancellation preserves safe focus, Escape and rejection recovery`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await open(page, {
      mode: 'active',
      page: kind === 'research' ? 'research' : 'resources',
      item: kind === 'research' ? 'EnergyTechnology' : 'MetalMine',
    })
    await page.evaluate(() => window.resourceScene.reject(true))
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const cancel = page.getByRole('button', {
      name: `Cancel ${kind}`,
      exact: true,
    })
    await expect(cancel).toBeEnabled()
    await expect(pane).toBeFocused()
    await cancel.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', {
      name: `Cancel ${kind}?`,
      exact: true,
    })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('30 seconds of work will be lost.')
    await expect(
      dialog.getByRole('button', { name: 'Keep working' }),
    ).toBeFocused()
    expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(cancel).toBeFocused()
    await cancel.click()
    await dialog.getByRole('button', { name: 'Yes, cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cancel).toBeEnabled()
    await expect(
      page.getByRole('region', { name: `Active ${kind}`, exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(() =>
        window.resourceScene.sent.map((e) => e.command),
      ),
    ).toEqual([
      {
        type: kind === 'construction' ? 'CancelConstruction' : 'CancelResearch',
        operation: '00000000-0000-4000-8000-000000000020',
      },
    ])
  })
}

test('quick build reserves competing rows and renders acknowledgment, countdown and reduced motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await open(page)
  await page.evaluate(() => window.resourceScene.hold())
  const build = page.getByRole('button', {
    name: 'Build Solar Plant level 2',
    exact: true,
  })
  const second = page.getByRole('button', {
    name: 'Build Metal Mine level 2',
    exact: true,
  })
  await expect(build).toBeEnabled()
  await expect(second).toBeEnabled()
  await page.evaluate(
    ([one, two]) => {
      ;(one as HTMLElement).click()
      ;(two as HTMLElement).click()
    },
    [await build.elementHandle(), await second.elementHandle()],
  )
  const control = page.getByRole('group', { name: 'Solar Plant quick build' })
  await expect(control).toHaveAttribute('data-phase', 'check')
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
  ).toBeDisabled()
  const row = page.getByRole('link', {
    name: 'Upgrade Solar Plant',
    exact: true,
  })
  const target = row.getByLabel('Target level 2')
  await expect(target).toHaveText('Level 2')
  await expect(target).toHaveCSS('font-weight', '700')
  await expect(row.getByLabel('Construction progress')).toContainText(
    'Level 1 → Level 2',
  )
  const titleBox = (await row
    .getByText('Solar Plant', { exact: true })
    .boundingBox())!
  const targetBox = (await target.boundingBox())!
  expect(targetBox.y).toBeGreaterThan(titleBox.y)
  expect(targetBox.x).toBeGreaterThan(titleBox.x)
  await expect(
    control.getByRole('img', { name: 'Build requested; confirming' }),
  ).toHaveCSS('transition-duration', '0.18s')
  await page.evaluate(() => window.resourceScene.release())
  await expect(
    control.getByRole('img', { name: 'Construction started' }),
  ).toBeVisible()
  await page.evaluate(() => {
    const model = window.resourceScene.model
    model.store.setState({ now: 3000 })
  })
  await expect(control).toHaveAttribute('data-phase', 'countdown')
  await expect(control.getByLabel('Solar Plant time remaining')).toContainText(
    /\d+s/,
  )
  await expect(control.getByLabel('Solar Plant time remaining')).toHaveCSS(
    'opacity',
    '1',
  )
  await expect(
    page.getByRole('link', { name: /^Solar Plant · Level 2/ }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Buildings', exact: true })
      .locator('dt')
      .filter({ hasText: /^Time remaining$/ })
      .locator('..')
      .locator('dd'),
  ).toHaveText(
    (await control.getByLabel('Solar Plant time remaining').textContent())!,
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(control.getByLabel('Solar Plant time remaining')).toHaveCSS(
    'transition-duration',
    '0s',
  )
  await expect(
    page.getByRole('group', { name: 'Latest action result' }),
  ).toHaveCount(0)
  expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(1)
})

for (const width of [1440, 390, 320]) {
  test.describe(`locked buildings at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 })
    test('unavailable facilities and resource buildings remain inspectable without construction requests', async ({
      page,
    }) => {
      for (const [destination, id, title] of [
        ['facilities', 'NaniteFactory', 'Nanite Factory'],
        ['facilities', 'Terraformer', 'Terraformer'],
        ['facilities', 'MissileSilo', 'Missile Silo'],
        ['resources', 'FusionReactor', 'Fusion Reactor'],
      ]) {
        await open(page, { mode: 'unavailable', page: destination })
        const tile = page.getByRole('link', {
          name: `Upgrade ${title}`,
          exact: true,
        })
        await expect(tile).toBeEnabled()
        await expect(tile).toContainText('Unavailable · Inspect details')
        await expect(
          page.getByRole('button', { name: `Build ${title}`, exact: true }),
        ).toBeDisabled()
        if (width < 600) await tile.tap()
        else {
          await tile.focus()
          await page.keyboard.press('Enter')
        }
        const pane = page.getByRole('region', { name: 'Progression quote' })
        await expect(pane).toBeVisible()
        await expect(
          pane.getByRole('heading', { name: title, exact: true }),
        ).toBeVisible()
        await expect(pane.getByRole('status')).toContainText(
          'Unavailable in this universe.',
        )
        await expect(
          pane.getByText('No prerequisites listed in this universe’s catalog.'),
        ).toHaveCount(0)
        await expect(
          pane.getByRole('button', { name: 'Confirm upgrade' }),
        ).toHaveCount(0)
        await expect(
          page.getByRole('button', {
            name: new RegExp(`^Build ${title}`),
            exact: true,
          }),
        ).toHaveCount(0)
        await expect(pane.getByRole('alert')).toHaveCount(0)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        if (id === 'NaniteFactory')
          await diagnosticScreenshot(pane, {
            path: `test-results/locked-unavailable-${width}.png`,
            animations: 'disabled',
          })
        await page.getByRole('link', { name: /^Back to / }).click()
        await expect(pane).toBeHidden()
        await expect(tile).toBeFocused()
        expect(
          await page.evaluate(() =>
            window.resourceScene.requests.map((r) =>
              'building' in r ? r.building : r.type,
            ),
          ),
        ).not.toContain(id)
      }
      expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
    })
  })
}

test('research progress suppresses hatching and completion refreshes next-level cost', async ({
  page,
}) => {
  await open(page, { mode: 'research', page: 'research' })
  const tile = page.getByRole('link', {
    name: 'Research Energy Technology',
    exact: true,
  })
  await expect(tile).toHaveClass(/unaffordable/)
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.progression.research_operation = {
      id: '00000000-0000-4000-8000-000000000020',
      host: s.view.bodies[0].id,
      research: 'EnergyTechnology',
      source_level: 1,
      target_level: 2,
      paid: s.view.bodies[0].amounts,
      started_at: s.view.sampled_at,
      due_at: s.view.sampled_at + 60000,
      labs: [],
      effective_lab: '1',
      can_cancel: true,
    }
    await s.refresh()
  })
  await expect(tile.getByLabel('Research progress')).toBeVisible()
  await expect(tile).not.toHaveClass(/unaffordable/)
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.progression.research_operation = null
    s.view.research[0].level = 2
    s.view.bodies[0].amounts.metal = '60000000'
    await s.refresh()
  })
  await expect(tile.getByLabel('Research progress')).toHaveCount(0)
  await expect(tile).toHaveClass(/unaffordable/)
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.metal = '120000000'
    await s.refresh()
  })
  await expect(tile).not.toHaveClass(/unaffordable/)
})

for (const selected of ['MetalMine', 'CrystalMine']) {
  test(`open ${selected} quote waits for confirmed construction completion`, async ({
    page,
  }) => {
    await open(page, { mode: 'active', item: 'MetalMine' })
    await page.evaluate(async (selected) => {
      const s = window.resourceScene
      s.view.constructions[0].building = 'CrystalMine'
      await s.refresh()
    }, selected)
    await page.getByRole('link', { name: /^Back to / }).click()
    await page
      .getByRole('link', {
        name:
          selected === 'MetalMine'
            ? 'Upgrade Metal Mine'
            : 'Upgrade Crystal Mine',
        exact: true,
      })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    if (selected === 'CrystalMine')
      await expect(
        pane.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
    else
      await expect(
        pane.getByRole('button', { name: 'Confirm upgrade' }),
      ).toBeDisabled()
    await page.evaluate(() =>
      window.resourceScene.model.store.setState({ now: 76000 }),
    )
    if (selected === 'CrystalMine')
      await expect(
        pane.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
    else
      await expect(
        pane.getByRole('button', { name: 'Confirm upgrade' }),
      ).toBeDisabled()
    await page.evaluate(async () => {
      const s = window.resourceScene
      s.view.constructions = []
      s.view.bodies[0].levels.CrystalMine = 2
      await s.refresh()
    })
    const build = pane.getByRole('button', { name: 'Confirm upgrade' })
    await expect(build).toBeEnabled()
    await expect(build).toHaveText(
      selected === 'CrystalMine' ? 'Build level 3' : 'Build level 2',
    )
  })
}

test('cached affordability remains visible while another building is active and inspections fail', async ({
  page,
}) => {
  await open(page, { mode: 'poor' })
  const tile = page.getByRole('link', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  const before = await page.evaluate(() => window.resourceScene.queries())
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.failInspection(true)
    s.view.constructions = [
      {
        id: '00000000-0000-4000-8000-000000000020',
        body: s.view.bodies[0].id,
        building: 'SolarPlant',
        target_level: 2,
        due_at: s.view.sampled_at + 76000,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ]
    await s.refresh()
  })
  await expect(
    page
      .getByRole('link', { name: 'Upgrade Solar Plant', exact: true })
      .getByLabel('Construction progress'),
  ).toBeVisible()
  expect(await page.evaluate(() => window.resourceScene.queries())).toBe(before)
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  await page.evaluate(async () => {
    const s = window.resourceScene
    s.view.bodies[0].amounts.metal = '60000000'
    await s.refresh()
  })
  await expect(tile).not.toHaveAttribute('title', /Not enough resources/)
})
