import { test, expect } from './fixture'
import { selectBody } from '../fixtures/body-selector'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { id } from '../../src/test-support/bootstrap'

test('alliance pages retain a visible attack warning without the planet bar on desktop and mobile', async ({
  page,
  mount,
}) => {
  await mount('shell-alliance-threat')
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    const warning = page
      .getByRole('status')
      .filter({ hasText: 'Incoming hostile fleet' })
    await expect(warning).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Planet and resources' }),
    ).toHaveCount(0)
    await expect(
      warning.getByRole('link', { name: 'View fleets' }),
    ).toHaveAttribute('href', /\/fleets$/)
    const bounds = await warning.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/alliance-threat-${width}x${height}.png`,
    })
  }
})

test('mobile resource stock uses icons and compact balances with capacity details on tap', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('shell-large-stocks')
  const ledger = page.getByLabel('Current resources')
  const metal = ledger.getByRole('button', { name: 'Metal details' })
  for (const width of [320, 390, 440]) {
    await page.setViewportSize({ width, height: 844 })
    for (const [name, amount] of [
      ['Metal', '1B'],
      ['Crystal', '1M'],
      ['Deuterium', '1T'],
      ['Energy', '26'],
    ]) {
      const resource =
        name === 'Energy'
          ? ledger.getByRole('link', { name: 'Energy — resource settings' })
          : ledger.getByRole('button', { name: `${name} details` })
      await expect(resource.locator('svg')).toBeVisible()
      expect((await resource.innerText()).trim()).toBe(amount)
      expect(
        await resource.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
      const icon = await resource.locator('svg').boundingBox()
      const number = await resource.locator('strong').boundingBox()
      expect(icon!.x + icon!.width).toBeLessThanOrEqual(number!.x)
      expect(
        Math.abs(icon!.y + icon!.height / 2 - number!.y - number!.height / 2),
      ).toBeLessThan(2)
    }
    expect((await ledger.boundingBox())!.height).toBe(44)
    expect((await ledger.locator('..').boundingBox())!.height).toBe(46)
    const planet = await page
      .getByRole('combobox', { name: 'Selected body' })
      .boundingBox()
    const stock = await ledger.boundingBox()
    await diagnosticScreenshot(page, {
      path: `test-results/mobile-planet-resources-${width}.png`,
      clip: {
        x: planet!.x - 1,
        y: Math.min(planet!.y, stock!.y) - 1,
        width: stock!.x + stock!.width - planet!.x + 2,
        height: Math.max(planet!.height, stock!.height) + 2,
      },
    })
  }
  expect(
    await metal
      .locator('strong')
      .evaluate((element) => getComputedStyle(element).color),
  ).not.toBe(
    await ledger
      .getByRole('link', { name: 'Energy — resource settings' })
      .locator('strong')
      .evaluate((element) => getComputedStyle(element).color),
  )
  await metal.click()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(details).toContainText('Available 1,000,000,000')
  await expect(details).toContainText('Capacity 10,000')
  await expect(details).toContainText('Storage full')
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await metal.innerText()).trim()).toBe('1B')
  await metal.evaluate((element) => element.blur())
  await diagnosticScreenshot(
    page.getByRole('group', { name: 'Planet and resources' }),
    { path: 'test-results/desktop-planet-resources.png' },
  )
  await metal.click()
  await expect(details).toContainText('Available 1,000,000,000')
  await expect(details).toContainText('Capacity 10,000')
  await expect(details).toContainText('Storage full')
})

test('mobile planet selector grows into free space while resource widths stay fixed', async ({
  page,
  mount,
}) => {
  const name = 'Nova Roma Research Colony'
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('shell-named')
  const selector = page.getByRole('combobox', { name: 'Selected body' })
  const label = selector.getByText(name, { exact: true })
  const ledger = page.getByLabel('Current resources')
  const widths = async () =>
    Promise.all(
      (await ledger.locator(':scope > button, :scope > a').all()).map(
        async (resource) => (await resource.boundingBox())!.width,
      ),
    )
  const baseline = await widths()
  const compact = (await selector.boundingBox())!
  expect(
    await label.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true)
  for (const width of [440, 767, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const planet = (await selector.boundingBox())!
    const stock = (await ledger.boundingBox())!
    const gutter = width < 360 ? 8 : 18
    expect(planet.x).toBe(gutter)
    expect(stock.x + stock.width).toBeCloseTo(width - gutter, 1)
    expect(planet.x + planet.width).toBeCloseTo(stock.x - 4, 1)
    expect(await widths()).toEqual(baseline)
    expect(stock.height).toBe(44)
    if (width === 767) {
      expect(planet.width - compact.width).toBeCloseTo(767 - 390, 1)
      expect(
        await label.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})

test('mobile top bar stays pinned while content scrolls beneath it and details remain usable', async ({
  page,
  mount,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('shell-default')
  const bar = page.getByRole('group', { name: 'Planet and resources' })
  const main = page.locator('main')
  await expect(bar.locator('..')).toHaveCSS('position', 'fixed')
  await expect(bar).toHaveCSS('border-bottom-width', '1px')
  await expect(bar).toHaveCSS('border-bottom-style', 'solid')
  expect(
    await bar.evaluate(
      (element) => getComputedStyle(element, '::before').backgroundColor,
    ),
  ).toBe('rgb(7, 22, 32)')
  const initial = await bar.boundingBox()
  expect(initial!.y).toBe(0)
  expect(initial!.x).toBe(0)
  expect(initial!.width).toBe(390)
  expect((await main.boundingBox())!.y).toBeGreaterThanOrEqual(initial!.height)
  for (const scroll of [250, 100000]) {
    await page.evaluate((y) => window.scrollTo(0, y), scroll)
    await expect.poll(async () => (await bar.boundingBox())!.y).toBe(0)
    expect((await main.boundingBox())!.y).toBeLessThan(0)
    expect(
      await bar.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(10, rect.height / 2))
      }),
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Metal details' }).click()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(details).toContainText('Available 6,661')
  expect((await details.boundingBox())!.y).toBeGreaterThanOrEqual(
    initial!.height,
  )
  await page.keyboard.press('Escape')
  await selectBody(page, id(6))
  await expect(
    page.getByRole('combobox', { name: 'Selected body' }),
  ).toHaveAttribute('data-value', id(6))
  await expect.poll(async () => (await bar.boundingBox())!.y).toBe(0)
  await page.evaluate(() => window.scrollTo(0, 250))
  await diagnosticScreenshot(page, {
    path: 'test-results/mobile-pinned-top-bar.png',
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(bar).toHaveCSS('position', 'static')
})

for (const width of [320, 390]) {
  test(`mobile Develop submenu spans the ${width}px viewport and stays below resources while scrolling`, async ({
    page,
    mount,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 844 })
    await mount('shell-roster')
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const bar = page.getByRole('group', { name: 'Planet and resources' })
    const nav = page.getByRole('navigation', { name: 'Develop navigation' })
    await expect(nav).toHaveCSS('scrollbar-width', 'none')
    const assertPinned = async () => {
      const resources = (await bar.boundingBox())!
      const submenu = (await nav.boundingBox())!
      expect(resources.y).toBe(0)
      expect(resources.x).toBe(0)
      expect(resources.width).toBe(width)
      expect(submenu.y).toBe(resources.y + resources.height)
      expect(submenu.x).toBe(0)
      expect(submenu.width).toBe(width)
      const dock = (await page
        .getByRole('navigation', { name: 'Main navigation', exact: true })
        .boundingBox())!
      expect(dock.y + dock.height).toBe(844)
    }
    for (const scroll of [0, 250, 100000]) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll)
      await expect.poll(async () => (await bar.boundingBox())!.y).toBe(0)
      await assertPinned()
    }
    await nav.getByRole('link', { name: 'Defense', exact: true }).focus()
    expect(await nav.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
      0,
    )
    await page.keyboard.press('Enter')
    await expect(page.locator('main h1')).toHaveText('Defense')
    await assertPinned()
    await diagnosticScreenshot(page, {
      path: `test-results/mobile-pinned-build-${width}.png`,
    })
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
    await page.evaluate(() => window.scrollTo(0, 250))
    await assertPinned()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    await diagnosticScreenshot(page, {
      path: `test-results/mobile-pinned-build-large-text-${width}.png`,
    })
  })
}

for (const width of [768, 1440, 1920]) {
  test(`desktop header spans the top while submenu stays aligned at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('shell-default')
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const submenu = page.getByRole('navigation', { name: 'Develop navigation' })
    const header = page
      .getByRole('group', { name: 'Planet and resources' })
      .locator('../..')
    const content = (await page.locator('main#main').boundingBox())!
    const headerBounds = (await header.boundingBox())!
    const sidebar =
      width >= 1024
        ? await page
            .getByRole('complementary', { name: 'Game navigation' })
            .boundingBox()
        : null
    expect(headerBounds.x).toBeCloseTo(
      sidebar ? sidebar.x + sidebar.width : 0,
      1,
    )
    expect(
      await header.evaluate((element) =>
        element.contains(document.elementFromPoint(innerWidth - 1, 32)),
      ),
    ).toBe(true)
    if (width < 1024) {
      const bounds = (await submenu.boundingBox())!
      expect(bounds.x).toBeCloseTo(content.x, 1)
      expect(bounds.x + bounds.width).toBeCloseTo(content.x + content.width, 1)
    }
    await expect(header).toHaveCSS('border-bottom-width', '1px')
    if (width < 1024) await expect(submenu).toHaveCSS('border-top-width', '1px')
    else {
      await expect(submenu).toHaveCSS('border-left-width', '1px')
      const bounds = (await submenu.boundingBox())!
      expect(bounds.x + bounds.width).toBeLessThan(content.x)
    }
    await diagnosticScreenshot(page, {
      path: `test-results/header-dividers-${width}.png`,
    })
  })
}

test('small phone resource row fits large stocks and negative energy without stacking', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await mount('shell-wide-stocks')
  // Exercise wider glyphs than macOS system-ui so Linux-sized balances also fit.
  await page.addStyleTag({
    content:
      '[aria-label="Current resources"] strong { font-family: monospace; letter-spacing: 0.5px; }',
  })
  const ledger = page.getByLabel('Current resources')
  for (const [name, amount] of [
    ['Metal', '9.2T'],
    ['Crystal', '999B'],
    ['Deuterium', '99M'],
    ['Energy', '-999B'],
  ]) {
    const resource =
      name === 'Energy'
        ? ledger.getByRole('link', { name: 'Energy — resource settings' })
        : ledger.getByRole('button', { name: `${name} details` })
    expect((await resource.innerText()).trim()).toBe(amount)
    expect(
      await resource.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    const icon = await resource.locator('svg').boundingBox()
    const number = await resource.locator('strong').boundingBox()
    expect(icon!.x + icon!.width).toBeLessThanOrEqual(number!.x)
    expect(
      Math.abs(icon!.y + icon!.height / 2 - number!.y - number!.height / 2),
    ).toBeLessThan(2)
  }
  expect((await ledger.boundingBox())!.height).toBe(44)
})

test('planet ledger retains its borders beside the desktop sidebar', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('shell-default')
  await expect(
    page.getByRole('complementary', { name: 'Planets and moons' }),
  ).toHaveCount(0)
  const bar = page.getByRole('group', { name: 'Planet and resources' })
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(bar).toHaveCSS('border-top-width', '0px')
    await expect(bar).toHaveCSS('border-bottom-width', '0px')
    await expect(bar.locator('../..')).toHaveCSS('border-bottom-width', '1px')
    for (const section of await bar.locator(':scope > div').all()) {
      await expect(section).toHaveCSS('border-top-width', '0px')
      await expect(section).toHaveCSS('border-bottom-width', '0px')
    }
    const bounds = await bar.boundingBox()
    const content = await page.locator('main').boundingBox()
    if (width < 1024) expect(bounds!.x).toBeGreaterThan(content!.x)
    else expect(bounds!.x).toBeCloseTo(content!.x, 1)
    expect(bounds!.x + bounds!.width).toBeCloseTo(
      content!.x + content!.width,
      1,
    )
    expect(bounds!.height).toBe(64)
    if (width >= 1024) {
      const brand = await page
        .getByRole('complementary', { name: 'Game navigation' })
        .getByRole('link', { name: 'ORBIT IMPERIUM', exact: true })
        .boundingBox()
      expect(
        Math.abs(brand!.y + brand!.height / 2 - bounds!.y - bounds!.height / 2),
      ).toBeLessThan(2)
    }
    expect(
      (
        await bar.getByRole('button', { name: 'Metal details' }).innerText()
      ).trim(),
    ).toBe('6.6K')
  }
  const selector = await page
    .getByRole('combobox', { name: 'Selected body' })
    .boundingBox()
  const ledger = await page.getByLabel('Current resources').boundingBox()
  expect(
    Math.abs(
      selector!.y + selector!.height / 2 - ledger!.y - ledger!.height / 2,
    ),
  ).toBeLessThan(10)
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Resources')
  await expect(
    page
      .getByRole('navigation', { name: 'Develop navigation' })
      .getByRole('link'),
  ).toHaveText(['Resources', 'Facilities', 'Research', 'Shipyard', 'Defense'])
})

test('phone Develop navigation keeps full-size links on one keyboard-scrollable row', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount('shell-default')
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Develop navigation' })
  const links = nav.getByRole('link')
  await expect(links).toHaveCount(5)
  const boxes = await links.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  )
  expect(new Set(boxes.map((box) => box.y)).size).toBe(1)
  expect(boxes.every((box) => box.height >= 44)).toBe(true)
  const last = nav.getByRole('link', { name: 'Defense', exact: true })
  await last.focus()
  const navBox = await nav.boundingBox(),
    lastBox = await last.boundingBox()
  expect(lastBox!.x).toBeGreaterThanOrEqual(navBox!.x)
  expect(lastBox!.x + lastBox!.width).toBeLessThanOrEqual(
    navBox!.x + navBox!.width + 1,
  )
  await page.keyboard.press('Enter')
  await expect(page.locator('main h1')).toHaveText('Defense')
  await page.setViewportSize({ width: 320, height: 740 })
  await page.addStyleTag({
    content:
      'html { font-size:200% !important } * { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important }',
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
})

// The sticky surface must cover decorations that extend beyond the content column.
test('fixed resource bar covers the full top edge while content scrolls', async ({
  page,
  mount,
}) => {
  await mount('shell-default')
  for (const width of [390, 768, 1024, 1440, 2200]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 40))
    const surface = await page
      .getByRole('group', { name: 'Planet and resources' })
      .evaluate((bar) => {
        const header = bar.parentElement!.parentElement!
        const sticky =
          getComputedStyle(header).display === 'contents' ? bar : header
        const rect = sticky.getBoundingClientRect()
        const point = document.elementFromPoint(
          innerWidth - 1,
          rect.top + rect.height / 2,
        )
        return {
          top: rect.top,
          coversRightEdge: !!point && sticky.contains(point),
          coversBelowEdge: sticky.contains(
            document.elementFromPoint(innerWidth - 1, rect.bottom + 0.5),
          ),
          pageWidth: document.documentElement.scrollWidth,
        }
      })
    expect(surface.top).toBe(0)
    expect(surface.coversRightEdge).toBe(true)
    expect(surface.coversBelowEdge).toBe(false)
    expect(surface.pageWidth).toBe(width)
  }
})

test('planet controls and their divider stay together when the document moves below the viewport top', async ({
  page,
  mount,
}) => {
  await mount('shell-default')
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    const bar = page.getByRole('group', { name: 'Planet and resources' })
    const surface = width < 768 ? bar.locator('..') : bar.locator('../..')
    await expect(surface).toHaveCSS('position', 'fixed')
    const initial = (await surface.boundingBox())!
    const main = (await page.locator('main').boundingBox())!
    expect(main.y).toBeGreaterThanOrEqual(initial.height)

    // Headless browsers cannot synthesize native rubber-banding. Displace the
    // document to catch a sticky control separating from its fixed backdrop.
    const displacement = await page.addStyleTag({
      content: 'body { padding-top: 48px; }',
    })
    expect((await page.locator('main').boundingBox())!.y).toBe(main.y + 48)
    expect((await surface.boundingBox())!.y).toBe(0)
    expect((await bar.boundingBox())!.y).toBe(0)
    if (width >= 768) {
      expect(
        await surface.evaluate((element) => ({
          top: getComputedStyle(element, '::before').top,
          height: getComputedStyle(element, '::before').height,
        })),
      ).toEqual({ top: '0px', height: `${initial.height}px` })
    }
    await diagnosticScreenshot(page, {
      path: `test-results/fixed-header-displaced-${width}x${height}.png`,
    })
    await displacement.evaluate((element) => element.remove())
    await diagnosticScreenshot(page, {
      path: `test-results/fixed-header-${width}x${height}.png`,
    })
  }
})

test('wide sticky header does not overflow a narrower layout viewport', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 2200, height: 900 })
  await mount('shell-default')
  // Model the 15px difference between viewport units and available layout width.
  await page.addStyleTag({ content: 'body { width: calc(100% - 15px); }' })
  const bounds = await page
    .getByRole('group', { name: 'Planet and resources' })
    .evaluate((bar) => ({
      headerRight:
        bar.parentElement!.parentElement!.getBoundingClientRect().right,
      layoutRight: document.body.getBoundingClientRect().right,
    }))
  expect(bounds.headerRight).toBeLessThanOrEqual(bounds.layoutRight)
})
