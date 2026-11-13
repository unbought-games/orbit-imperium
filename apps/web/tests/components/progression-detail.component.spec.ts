import { test, expect, type Page, type Locator } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { captureCatalog } from '../fixtures/catalog-capture'

async function openDetail(
  page: Page,
  item: string,
  mode = '',
  protocol: 3 | 4 = 4,
  options: Record<string, string> = {},
) {
  await page.goto(
    '/?' +
      new URLSearchParams({
        scenario: 'progression-detail',
        item,
        mode,
        protocol: String(protocol),
        ...options,
      }),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'progression-detail',
  )
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toBeVisible()
  await expect(
    pane.getByText(/Loading (building|technology) details/),
  ).toHaveCount(0)
}

async function expectLegibleInspector(pane: Locator) {
  // Details appear in place immediately, with prices and blockers fully visible.
  await expect(pane).toHaveCSS('opacity', '1')
  const dimmed = await pane
    .locator('h2, table, [aria-label="Action blockers"]')
    .evaluateAll((nodes) => {
      const ancestors = []
      for (const node of nodes) {
        for (
          let current: Element | null = node;
          current;
          current = current.parentElement
        ) {
          const style = getComputedStyle(current)
          if (Number(style.opacity) < 1 || style.filter !== 'none')
            ancestors.push(current.tagName)
        }
      }
      return ancestors
    })
  expect(dimmed).toEqual([])
  await expect(pane).toHaveCSS('transform', 'none')
  await expect(pane).toHaveCSS('animation-name', 'none')
  await expect(pane).toHaveCSS('transition-duration', '0s')
  await expectUndistortedArt(pane)
}

async function expectUndistortedArt(scope: Locator) {
  const scales = await scope
    .locator('img, [style*="background-image"], svg image')
    .evaluateAll(async (nodes) =>
      Promise.all(
        nodes.map(async (node) => {
          if (node instanceof HTMLImageElement) {
            await node.decode()
            const style = getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            if (style.objectFit === 'contain' || style.objectFit === 'cover') {
              return { x: 1, y: 1 }
            }
            return {
              x: rect.width / node.naturalWidth,
              y: rect.height / node.naturalHeight,
            }
          }
          const image = new Image()
          const svg = node instanceof SVGImageElement ? node : null
          const style = getComputedStyle(node)
          image.src = svg?.href.baseVal ?? style.backgroundImage.slice(5, -2)
          await image.decode()
          if (svg) {
            const matrix = svg.getScreenCTM()!
            return {
              x: (matrix.a * svg.width.baseVal.value) / image.naturalWidth,
              y: (matrix.d * svg.height.baseVal.value) / image.naturalHeight,
            }
          }
          const [width, height] = style.backgroundSize
            .split(' ')
            .map(parseFloat)
          const rect = node.getBoundingClientRect()
          return {
            x: (rect.width * width) / 100 / image.naturalWidth,
            y: (rect.height * height) / 100 / image.naturalHeight,
          }
        }),
      ),
    )
  expect(scales.length).toBeGreaterThan(0)
  for (const scale of scales) expect(scale.x).toBeCloseTo(scale.y, 4)
}

test('catalog detail artwork preserves source proportions in a tall panel', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await openDetail(page, 'RoboticsFactory')
  await expectUndistortedArt(
    page.getByRole('region', { name: 'Progression quote' }),
  )
  await diagnosticScreenshot(page, {
    path: 'test-results/catalog-detail-art.png',
  })
})

test('selected unit decisions floor balances and retain large inventory on phones', async ({
  page,
}) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await openDetail(page, 'SmallCargo', 'inventory')
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expectLegibleInspector(pane)
    await expect(pane.getByLabel('Unit inventory')).toContainText(
      '9,007,199,254,740,993',
    )
    await pane.getByText('Requirements & order terms', { exact: true }).click()
    const metal = pane
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Metal details' }) })
    await expect(
      metal.locator('td').nth(0).getByText('60', { exact: true }),
    ).toBeVisible()
    await expect(
      metal.locator('td').nth(1).getByText('0', { exact: true }),
    ).toBeVisible()
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeEnabled()
    const back = pane.getByRole('link', {
      name: 'Back to Shipyard',
      exact: true,
    })
    await expect(back).toHaveText('')
    await expect(back.locator('svg')).toBeVisible()
    const backBox = await back.boundingBox()
    expect(backBox?.width).toBeGreaterThanOrEqual(44)
    expect(backBox?.height).toBeGreaterThanOrEqual(44)
    expect(
      await back.evaluate(
        (element) => getComputedStyle(element, '::before').width,
      ),
    ).toBe('36px')
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toHaveText('Order 1 Small Cargo')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await captureCatalog(
      page,
      `test-results/progression-ships-selected-${width}.png`,
    )
    await diagnosticScreenshot(page, {
      path: `test-results/progression-ships-selected-${width}-viewport.png`,
      animations: 'disabled',
    })
    await pane
      .getByRole('button', { name: 'Build', exact: true })
      .click({ trial: true })
    await diagnosticScreenshot(page, {
      path: `test-results/progression-ships-decision-${width}-viewport.png`,
      animations: 'disabled',
    })
  }
})

test('selected facilities research and defense show reviewable decisions at all target widths', async ({
  page,
}) => {
  for (const [path] of [
    ['facilities', 'Upgrade Robotics Factory'],
    ['research', 'Research Combustion Drive'],
    ['defense', 'Build Rocket Launcher'],
  ]) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await openDetail(
        page,
        path === 'facilities'
          ? 'RoboticsFactory'
          : path === 'research'
            ? 'CombustionDrive'
            : 'RocketLauncher',
        'blocked',
      )
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane.getByLabel('Action blockers')).toContainText(
        'No Free Field',
      )
      await expectLegibleInspector(pane)
      await expect(
        pane.getByRole('button', {
          name:
            path === 'facilities'
              ? 'Confirm upgrade'
              : path === 'research'
                ? 'Confirm research'
                : 'Build',
          exact: true,
        }),
      ).toBeDisabled()
      await captureCatalog(
        page,
        `test-results/progression-${path}-blocked-${width}.png`,
      )
    }
  }
})

test('active facility remains cancellable without a fresh quote at each target width', async ({
  page,
}) => {
  await openDetail(page, 'RoboticsFactory', 'active')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Cancel construction', exact: true }),
    ).toBeEnabled()
    await expect(
      pane.getByRole('group', { name: 'Cancellation refund', exact: true }),
    ).toContainText('60')
    await expectLegibleInspector(pane)
    await captureCatalog(
      page,
      `test-results/progression-facilities-active-${width}.png`,
    )
  }
})

test('narrow spending ledgers keep whole large balances intact with visible labels', async ({
  page,
}) => {
  for (const [width, textSize, wideFont] of [
    [320, 100, false],
    [390, 100, false],
    [320, 200, false],
    [320, 200, true],
  ] as const) {
    await page.setViewportSize({ width, height: 844 })
    await openDetail(page, 'SmallCargo', 'ledger')
    if (textSize === 200)
      await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
    // Also exercise wider glyphs on hosts whose default system font is narrow.
    if (wideFont)
      await page.addStyleTag({
        content: 'html { font-family: monospace !important }',
      })
    await page.getByText('Requirements & order terms', { exact: true }).click()
    const table = page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('table')
    await expect(
      table.getByText('Available', { exact: true }).last(),
    ).toBeVisible()
    const crystal = table
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Crystal details' }) })
    const values = [
      table
        .getByRole('button', { name: 'Metal details' })
        .getByText('9,007,199,254', { exact: true }),
      crystal.getByText('9,007,199,254', { exact: true }),
      crystal.getByText('9,007,199,239', { exact: true }),
    ]
    for (const value of values) {
      await expect(value).toBeVisible()
      const rects = await value.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return [...range.getClientRects()].map(({ left, right }) => ({
          left,
          right,
        }))
      })
      expect(
        rects,
        `Exact balance at ${width}px / ${textSize}% / wide font ${wideFont}`,
      ).toHaveLength(1)
      expect(rects[0]!.left).toBeGreaterThanOrEqual(0)
      expect(rects[0]!.right).toBeLessThanOrEqual(width)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/final-integration/exact-large-cost-${width}-${textSize}${wideFont ? '-wide-font' : ''}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
})

for (const { width, protocol } of [
  { width: 390, protocol: 4 as const },
  { width: 1280, protocol: 3 as const },
]) {
  test(`ship technical statistics show authoritative base values at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openDetail(page, 'SmallCargo', 'stats', protocol)
    await page.getByText('Technical data', { exact: true }).click()
    const detail = page.getByRole('region', {
      name: 'Ship technical statistics',
    })
    const assertStats = async (section: Locator) => {
      for (const [name, value] of [
        ['Cargo capacity', '7,654'],
        ['Base speed', '4,321'],
        ['Base fuel consumption', '17'],
        ['Attack strength', '12.34'],
        ['Shield strength', '56.78'],
        ['Hull strength', '800'],
      ]) {
        await expect(
          section
            .locator('dl > div')
            .filter({ has: page.getByText(name, { exact: true }) })
            .locator('dd'),
        ).toHaveText(value)
      }
      await expect(section).toContainText(
        'Base values per ship, before research bonuses.',
      )
      await expect(section).toContainText('At Impulse Drive level 8')
      await expect(section).toContainText('Espionage Probe × 5')
      await expect(section).toContainText('Rapid fire fromNone')
      await expect(section).toContainText('9,876')
      await expect(
        section.locator('dl').getByLabel('Deuterium', { exact: true }),
      ).toBeVisible()
    }
    await assertStats(detail)
    await expect
      .poll(() => detail.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await detail
        .getByRole('heading', { name: 'Ship technical statistics' })
        .click()
      await detail.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/ship-statistics-detail-${width}.png`,
      })
    }
    await page
      .getByRole('button', { name: 'Technology tree', exact: true })
      .click()
    await page.getByRole('tab', { name: 'Techinfo', exact: true }).click()
    const dialog = page.getByRole('dialog', {
      name: 'Technology — Small Cargo',
    })
    await dialog.getByText('Technical data', { exact: true }).click()
    await assertStats(
      dialog.getByRole('region', { name: 'Ship technical statistics' }),
    )
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth))
      .toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/ship-statistics-techinfo-${width}.png`,
    })
  })
}

test('older protocol ship details explicitly show unavailable technical statistics', async ({
  page,
}) => {
  await openDetail(page, 'SmallCargo', 'legacy', 3)
  await page.getByText('Technical data', { exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Ship technical statistics' }),
  ).toContainText('Technical statistics are unavailable')
  await page
    .getByRole('button', { name: 'Technology tree', exact: true })
    .click()
  await page.getByRole('tab', { name: 'Techinfo', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByText('Technical data', { exact: true })
    .click()
  await expect(
    page
      .getByRole('dialog')
      .getByRole('region', { name: 'Ship technical statistics' }),
  ).toContainText('Technical statistics are unavailable')
})

for (const width of [320, 390, 1440]) {
  test(`manufacturing stacks every exact resource cost in compact rows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })

    for (const [pageName, , quantityLabel] of [
      ['Shipyard', 'Small Cargo', 'Shipyard quantity'],
      ['Defense', 'Rocket Launcher', 'Defenses quantity'],
    ] as const) {
      await openDetail(
        page,
        pageName === 'Shipyard' ? 'SmallCargo' : 'RocketLauncher',
        'costs',
      )
      const order = page.getByRole('region', { name: 'New order', exact: true })
      const costs = order.getByRole('group', { name: 'Required resources' })
      for (const quantity of ['1', '123456789']) {
        await order.getByRole('textbox', { name: quantityLabel }).fill(quantity)
        for (const [resource, unit] of [
          ['Metal', 10000n],
          ['Crystal', 6000n],
          ['Deuterium', 2000n],
        ] as const) {
          const amount = costs.getByRole('button', {
            name: `${resource} details`,
            exact: true,
          })
          await expect(amount).toHaveText(
            (unit * BigInt(quantity)).toLocaleString('en-US'),
          )
          const bounds = await amount.boundingBox()
          const container = await costs.locator('..').boundingBox()
          expect(bounds!.x).toBeGreaterThanOrEqual(container!.x)
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
            container!.x + container!.width + 1,
          )
          expect(
            await amount.evaluate((el) => el.scrollWidth <= el.clientWidth),
          ).toBe(true)
        }
        const rows = await costs.getByRole('button').evaluateAll((elements) =>
          elements.map((el) => {
            const { top, bottom, right, height } = el.getBoundingClientRect()
            return { top, bottom, right, height }
          }),
        )
        expect(rows).toHaveLength(3)
        const labelBounds = (await order
          .getByText('New order cost', { exact: true })
          .boundingBox())!
        const costBounds = (await costs.boundingBox())!
        expect(labelBounds.x + labelBounds.width).toBeLessThan(costBounds.x)
        expect(
          Math.abs(
            labelBounds.y +
              labelBounds.height / 2 -
              costBounds.y -
              costBounds.height / 2,
          ),
        ).toBeLessThan(1)
        await expect(
          order
            .locator('dt')
            .filter({ hasText: /^Order complete$/ })
            .locator('..'),
        ).toHaveCSS('border-bottom-width', '1px')
        for (const [index, row] of rows.entries()) {
          expect(row.height).toBeGreaterThanOrEqual(24)
          expect(row.height).toBeLessThanOrEqual(28)
          expect(Math.abs(row.right - rows[0].right)).toBeLessThan(1)
          if (index > 0) {
            expect(row.top).toBeGreaterThanOrEqual(rows[index - 1].bottom)
            expect(row.top - rows[index - 1].bottom).toBeLessThanOrEqual(2)
          }
        }
        expect(
          await costs
            .locator('..')
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        const icons = await costs
          .locator('svg')
          .evaluateAll((elements) =>
            elements.map((el) => getComputedStyle(el).color),
          )
        expect(new Set(icons).size).toBe(3)
        await diagnosticScreenshot(order, {
          path: `test-results/manufacturing-${pageName}-${width}-${quantity}.png`,
        })
      }
      await order
        .getByRole('button', { name: 'Deuterium details', exact: true })
        .click()
      await expect(
        page.getByRole('dialog', { name: 'Deuterium', exact: true }),
      ).toContainText('246,913,578,000')
      await page.keyboard.press('Escape')
    }
  })
}

for (const width of [1440, 390]) {
  test(`Recycler salvage field notes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await openDetail(page, 'Recycler')
    await expect(
      page.getByText(
        'A salvage vessel that turns shattered fleets into the beginnings of new ones. After the weapons fall silent, recyclers work the wreckage—and rivals race to claim what remains.',
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Build', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(
      page.getByRole('heading', { name: 'Recycler', exact: true }),
    ).toBeInViewport()
    await diagnosticScreenshot(page, {
      path: `test-results/deuterium-recycler-${width}x1000.png`,
      fullPage: true,
    })
  })
}

for (const [item, width] of [
  ['Bomber', 390],
  ['Destroyer', 1440],
] as const) {
  test(`${item} disclosure distinguishes an upgrade from native hyperspace propulsion`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(
      '/?' +
        new URLSearchParams({
          scenario: 'progression-detail',
          item,
          mode: 'profile',
        }),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toBeFocused()
    const summary = pane
      .locator('summary')
      .filter({ hasText: /^Technical data$/ })
    await summary.focus()
    await page.keyboard.press('Enter')
    const stats = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    await expect(stats).toBeVisible()
    await expect(stats).toContainText('Hyperspace Drive')
    await expect(stats).toContainText('5,000')
    if (item === 'Bomber')
      await expect(stats).toContainText('At Hyperspace Drive level 8')
    else await expect(stats).not.toContainText('At Hyperspace Drive level')
    await page.keyboard.press('Space')
    await expect(stats).toBeHidden()
  })
}

for (const width of [390, 1280]) {
  test(`technical disclosures and modal tabs work with the keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    for (const [item, text, name] of [
      ['RoboticsFactory', 'The raw construction duration', 'Robotics Factory'],
      ['CombustionDrive', '+15% of base', 'Combustion Drive'],
      ['RocketLauncher', 'Base values per defense', 'Rocket Launcher'],
    ]) {
      await openDetail(page, item, 'technical')
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane).toBeFocused()
      const disclosure = pane.locator('details').filter({
        has: page.locator('summary').filter({ hasText: /^Technical data$/ }),
      })
      const summary = disclosure.locator('summary')
      await expect(summary).toBeVisible()
      await expect(disclosure).not.toHaveAttribute('open', '')
      await expect(disclosure.getByText(text, { exact: false })).toBeHidden()
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(disclosure).toHaveAttribute('open', '')
      await expect(disclosure).toContainText(text)
      if (item === 'CombustionDrive') {
        await expect(disclosure).toContainText(
          'Replaced when Impulse Drive reaches level 8',
        )
        await expect(disclosure).toContainText('Level 6')
        await expect(
          disclosure.getByRole('link', { name: 'Small Cargo', exact: true }),
        ).toBeVisible()
        await expect(disclosure).not.toContainText('Dreadnought')
      }
      expect(
        await disclosure.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      await page.keyboard.press('Space')
      await expect(disclosure).not.toHaveAttribute('open', '')
      const opener = pane.getByRole('button', {
        name: 'Technology tree',
        exact: true,
      })
      await opener.focus()
      await page.keyboard.press('Enter')
      const dialog = page.getByRole('dialog', { name: `Technology — ${name}` })
      await dialog.getByRole('tab', { name: 'Techtree', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      const applications = dialog.getByRole('tab', {
        name: 'Applications',
        exact: true,
      })
      await expect(applications).toBeFocused()
      await expect(applications).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('End')
      await expect(
        dialog.getByRole('tab', { name: 'Techinfo', exact: true }),
      ).toBeFocused()
      const modalData = dialog.locator('details')
      await expect(modalData).not.toHaveAttribute('open', '')
      await modalData.locator('summary').click()
      await expect(modalData).toContainText(text)
      if (item === 'CombustionDrive')
        await expect(
          dialog.getByRole('list', { name: 'Prerequisites', exact: true }),
        ).toHaveCount(1)
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(opener).toBeFocused()
    }
  })
}

for (const [item, title, kind] of [
  ['CrystalMine', 'Crystal Mine', 'Construction'],
  ['ResearchLab', 'Research Lab', 'Construction'],
  ['ImpulseDrive', 'Impulse Drive', 'Research'],
] as const) {
  test(`${title} keeps a long catalog countdown on one line`, async ({
    page,
  }) => {
    for (const [duration, text] of [
      [5760000, '1h 36m'],
      [10627200000, '123 days'],
    ] as const) {
      await page.goto(
        '/?' +
          new URLSearchParams({
            scenario: 'progression-detail',
            item,
            mode: 'progress',
            list: 'yes',
            duration: String(duration),
          }),
      )
      const row = page.getByRole('link', {
        name: `${kind === 'Research' ? 'Research' : 'Upgrade'} ${title}`,
        exact: true,
      })
      const progress = row.getByRole('group', { name: `${kind} progress` })
      const timer = page.getByLabel(`${title} time remaining`, { exact: true })
      const target = progress.getByLabel('Target level 5')
      await expect(progress).toContainText('Level 4 → Level 5')
      await expect(target).toHaveText('Level 5')
      await expect(target).toHaveCSS('font-weight', '700')
      await expect(timer).toHaveText(text)
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        const lines = await timer
          .getByText(text, { exact: true })
          .evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return [...range.getClientRects()].map((rect) => rect.y)
          })
        expect(new Set(lines).size).toBe(1)
        const timerBox = (await timer.boundingBox())!
        // Building timers live in the separate quick-build control in the row.
        const rowBox = (await row.boundingBox())!
        const targetBox = (await target.boundingBox())!
        expect(timerBox.x).toBeGreaterThanOrEqual(targetBox.x + targetBox.width)
        expect(
          rowBox.x + rowBox.width - timerBox.x - timerBox.width,
        ).toBeLessThanOrEqual(10)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      }
      await row.press('Enter')
      await expect(
        page.getByRole('region', { name: 'Progression quote' }),
      ).toBeFocused()
    }
  })
}

for (const [gate, label, width] of [
  ['Shipyard', 'Shipyard', 390],
  ['HyperspaceDrive', 'Hyperspace Drive', 1440],
  ['disabled', 'Unavailable in this universe.', 390],
] as const) {
  test(`Battleship inspection keeps Build disabled for ${gate}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await openDetail(page, 'Battleship', 'battleship', 4, { gate })
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeDisabled()
    const copy = gate === 'disabled' ? pane : pane.getByLabel('Action blockers')
    await expect(copy).toContainText(label)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

test('catalog art failure preserves confirmation and returns focus to the opener', async ({
  page,
}) => {
  await page.route('**/art/**', (route) => route.abort())
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(
      '/?' +
        new URLSearchParams({
          scenario: 'progression-detail',
          item: 'RoboticsFactory',
          list: 'yes',
        }),
    )
    const marker = page.getByRole('link', {
      name: 'Upgrade Robotics Factory',
      exact: true,
    })
    await marker.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await pane.getByRole('link', { name: 'Back to Facilities' }).click()
    await expect(marker).toBeFocused()
    await expect(pane).toBeHidden()
    expect(await page.evaluate(() => window.progressionScene.sent)).toEqual([])
  }
})

for (const [item, action] of [
  ['RoboticsFactory', 'Confirm upgrade'],
  ['CombustionDrive', 'Confirm research'],
  ['SmallCargo', 'Build'],
  ['RocketLauncher', 'Build'],
] as const) {
  test(`${item} confirmation uses live balances without reopening the detail`, async ({
    page,
  }) => {
    await openDetail(page, item)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const confirm = pane.getByRole('button', { name: action, exact: true })
    await expect(confirm).toBeEnabled()
    await page.evaluate(async () => {
      const scene = window.progressionScene
      scene.view.bodies[0].amounts.metal = '59999999'
      await scene.refresh()
    })
    await expect(confirm).toBeDisabled()
    await expect(
      pane
        .getByLabel('Missing resources')
        .getByRole('img', { name: 'metal', exact: true }),
    ).toBeVisible()
    await page.evaluate(async () => {
      const scene = window.progressionScene
      scene.view.bodies[0].amounts.metal = '60000000'
      await scene.refresh()
    })
    await expect(confirm).toBeEnabled()
    await expect(pane.getByLabel('Missing resources')).toHaveCount(0)
  })
}
