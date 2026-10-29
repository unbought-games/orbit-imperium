import { setDestination, coordinatePattern } from './fixtures/coordinates'
import { selectBody } from './fixtures/body-selector'
import { attachFailureScreenshots, diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { navigate } from './fixtures/navigation'
import { confirmCancellation } from './fixtures/confirmation'
import { test, expect } from './fixtures/test'
import {
  installGameFixture,
  refreshGame,
  shellFixture,
  playerProfilesFixture,
  id,
  body,
  resources,
  binding,
} from './fixtures/game'

test('supporter claims color the shared account identity after sign-in and clear on refresh', async ({
  page,
}) => {
  await shellFixture(page)
  await page.clock.install()
  let tier: number | undefined = 1
  let username = 'StellarNomad'
  let unavailable = false
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'oidc', universes: [] } }),
  )
  await playerProfilesFixture(page, () =>
    unavailable
      ? null
      : [{ player: binding.player, username, supporter_tier: tier }],
  )
  const colors = [
    'rgb(133, 214, 239)',
    'rgb(240, 172, 212)',
    'rgb(242, 187, 131)',
  ]
  const amounts = [10, 25, 100]
  for (const next of [1, 2, 3]) {
    tier = next
    await page.reload()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const identity = page.getByLabel('Username', { exact: true })
    await expect(
      identity.getByRole('img', {
        name: `Supporter · $${amounts[next - 1]} / month USD`,
      }),
    ).toBeVisible()
    await expect(identity.getByText(username).locator('..')).toHaveCSS(
      'color',
      colors[next - 1],
    )
    await expect(identity.locator('svg')).toHaveClass(/lucide-star/)
  }
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(
    page.getByText('Supporter · Thank you for supporting unbought games.'),
  ).toBeVisible()
  tier = undefined
  await page.clock.fastForward(60_000)
  await expect(
    page.getByText('Supporter · Thank you for supporting unbought games.'),
  ).toHaveCount(0)
  await expect(
    page.locator('main').getByText(username, { exact: true }),
  ).toBeVisible()
  // A later sign-in can identify a different account with no inherited tier.
  username = 'OtherCommander'
  await page.reload()
  await expect(
    page.locator('main').getByText(username, { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: /Supporter/ })).toHaveCount(0)
  tier = 2
  await page.reload()
  await expect(
    page.locator('main').getByRole('img', { name: /Supporter/ }),
  ).toBeVisible()
  unavailable = true
  await page.clock.fastForward(301_000)
  await expect(page.getByRole('img', { name: /Supporter/ })).toHaveCount(0)
})

for (const building of [null, 'MetalMine', 'ResearchLab'] as const) {
  test(`work summary links stay contextual with ${building ?? 'idle'} construction`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const now = Date.now()
    await page.clock.setFixedTime(now)
    const purchases = await shellFixture(page, {
      bodies: [body],
      constructions: building
        ? [
            {
              id: id(10),
              body: body.id,
              building,
              target_level: 2,
              due_at: now + 76000,
              paid: resources,
            },
          ]
        : [],
      researchOperation: building
        ? {
            id: id(11),
            host: body.id,
            research: 'EnergyTechnology',
            source_level: 0,
            target_level: 1,
            paid: resources,
            started_at: now,
            due_at: now + 76000,
            labs: [],
            effective_lab: '1',
            can_cancel: true,
          }
        : null,
    })
    const buildings = page.getByRole('region', {
      name: 'Buildings',
      exact: true,
    })
    await expect(
      buildings.getByRole('link', { name: 'Open buildings' }),
    ).toHaveAttribute(
      'href',
      `/u/andromeda/b/${body.id}/${building === 'ResearchLab' ? 'facilities' : 'resources'}`,
    )
    await expect(
      page.getByRole('link', { name: 'Open research' }),
    ).toHaveAttribute('href', `/u/andromeda/b/${body.id}/research`)
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const nav = page.getByRole('navigation', { name: 'Develop navigation' })
    for (const destination of ['Resources', 'Facilities'] as const) {
      await nav.getByRole('link', { name: destination, exact: true }).click()
      await expect(page.locator('main h1')).toHaveText(destination)
      const crossPage =
        building === 'MetalMine' && destination === 'Facilities'
          ? 'resources'
          : null
      await expect(buildings.getByRole('link', { name: /^Open / })).toHaveCount(crossPage ? 1 : 0)
      if (crossPage) {
        const link = buildings.getByRole('link', { name: `Open ${crossPage}` })
        await expect(link).toHaveAttribute(
          'href',
          `/u/andromeda/b/${body.id}/${crossPage}`,
        )
        await link.click()
        await expect(page.locator('main h1')).toHaveText(
          crossPage === 'resources' ? 'Resources' : 'Facilities',
        )
      }
      if (!building && destination === 'Facilities')
        await diagnosticScreenshot(page, {
          fullPage: true,
          animations: 'disabled',
          path: 'test-results/contextual-facilities-summary.png',
        })
    }
    await nav.getByRole('link', { name: 'Research', exact: true }).click()
    const research = page.getByRole('region', { name: 'Research', exact: true })
    await expect(research.getByRole('link', { name: /^Open / })).toHaveCount(0)
    await expect(research).toContainText(
      building ? 'Energy Technology · Level 1' : 'No research in progress.',
    )
    if (building)
      await expect(
        research.getByRole('button', { name: 'Cancel research' }),
      ).toBeEnabled()
    for (const destination of ['Shipyard', 'Defense'] as const) {
      await nav.getByRole('link', { name: destination, exact: true }).click()
      const manufacturing = page.getByRole('region', {
        name: 'Shipyard & defense',
        exact: true,
      })
      await expect(manufacturing.getByRole('link')).toHaveText([
        destination === 'Shipyard' ? 'Open defenses' : 'Open shipyard',
      ])
      await manufacturing.getByRole('link').click()
      await expect(page.locator('main h1')).toHaveText(
        destination === 'Shipyard' ? 'Defense' : 'Shipyard',
      )
    }
    expect(purchases()).toBe(0)
  })
}

test('cold Defense navigation retains named universe and planet through preloading, switching and direct loads', async ({
  page,
}) => {
  test.skip(!process.env.ORBIT_UI_E2E, 'Controls Vite route loading in the fixture browser suite.')
  await page.setViewportSize({ width: 390, height: 844 })
  const purchases = await shellFixture(page, {
    universeName: 'Andromeda Prime',
    protocol: 4,
  })
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Develop navigation' })
  let loading = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    (url) =>
      url.pathname.includes('defense') && url.search.includes('tsr-split'),
    async (route) => {
      loading = true
      await gate
      await route.continue()
    },
  )
  const defense = nav.getByRole('link', { name: 'Defense', exact: true })
  await defense.focus()
  await expect.poll(() => loading).toBe(true)
  await selectBody(page, id(6))
  await expect(defense).toHaveAttribute(
    'href',
    `/u/andromeda-prime/b/${id(6)}/defense`,
  )
  await defense.click()
  release()
  await expect(page.locator('main h1')).toHaveText('Defense')
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
  await expect(page).toHaveURL(`/u/andromeda-prime/b/${id(6)}/defense`)
  await page.reload()
  await expect(page.locator('main h1')).toHaveText('Defense')
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
  await page.goto(`/u/andromeda-prime/research?body=${id(6)}`)
  await nav.getByRole('link', { name: 'Defense', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Defense')
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
  await page.goBack()
  await expect(page.locator('main h1')).toHaveText('Research')
  await page.goForward()
  await expect(page.locator('main h1')).toHaveText('Defense')
  expect(purchases()).toBe(0)
})

test('mobile resource stock uses icons and compact balances with capacity details on tap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page, {
    bodies: [
      {
        ...body,
        amounts: {
          metal: '1000000000000000',
          crystal: '1000000000000',
          deuterium: '1000000000000000000',
        },
      },
    ],
  })
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
      const resource = ledger.getByRole('button', { name: `${name} details` })
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
    const planet = await page.getByRole('combobox', { name: 'Selected body' }).boundingBox()
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
      .getByRole('button', { name: 'Energy details' })
      .locator('strong')
      .evaluate((element) => getComputedStyle(element).color),
  )
  await metal.click()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(details).toContainText('Available 1,000,000,000')
  await expect(details).toContainText('Capacity 10,000')
  await expect(details).toContainText('Above capacity')
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
  await expect(details).toContainText('Above capacity')
})

test('mobile planet selector grows into free space while resource widths stay fixed', async ({ page }) => {
  const name = 'Nova Roma Research Colony'
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page, {
    bodies: [{ ...body, name }],
  })
  const selector = page.getByRole('combobox', { name: 'Selected body' })
  const label = selector.getByText(name, { exact: true })
  const ledger = page.getByLabel('Current resources')
  const widths = async () => Promise.all(
    (await ledger.locator(':scope > button, :scope > a').all()).map(async resource =>
      (await resource.boundingBox())!.width,
    ),
  )
  const baseline = await widths()
  const compact = (await selector.boundingBox())!
  expect(await label.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
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
      expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('mobile top bar stays pinned while content scrolls beneath it and details remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
  const bar = page.getByRole('group', { name: 'Planet and resources' })
  const main = page.locator('main')
  await expect(bar.locator('..')).toHaveCSS('position', 'sticky')
  await expect(bar).toHaveCSS('border-bottom-width', '1px')
  await expect(bar).toHaveCSS('border-bottom-style', 'solid')
  expect(await bar.evaluate(element => getComputedStyle(element, '::before').backdropFilter)).toBe('blur(4px)')
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
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
  await expect.poll(async () => (await bar.boundingBox())!.y).toBe(0)
  await page.evaluate(() => window.scrollTo(0, 250))
  await diagnosticScreenshot(page, { path: 'test-results/mobile-pinned-top-bar.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(bar).toHaveCSS('position', 'static')
})

for (const width of [320, 390]) {
  test(`mobile Develop submenu spans the ${width}px viewport and stays below resources while scrolling`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 844 })
    await shellFixture(page, {
      bodies: Array.from({ length: 9 }, (_, index) => ({
        ...body,
        id: index === 0 ? body.id : id(index + 20),
      })),
    })
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
  test(`desktop header dividers align with content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await shellFixture(page)
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const submenu = page.getByRole('navigation', { name: 'Develop navigation' })
    const header = page.getByRole('banner').locator('..')
    const content = (await page.locator('main#main').boundingBox())!
    for (const divider of [header, submenu]) {
      const bounds = (await divider.boundingBox())!
      expect(bounds.x).toBeCloseTo(content.x, 1)
      expect(bounds.x + bounds.width).toBeCloseTo(content.x + content.width, 1)
    }
    await expect(header).toHaveCSS('border-bottom-width', '1px')
    await expect(submenu).toHaveCSS('border-top-width', '1px')
    await diagnosticScreenshot(page, { path: `test-results/header-dividers-${width}.png` })
  })
}

for (const protocol of [3, 4] as const) {
  test(`Fleets navigation helper opens the fleet list with protocol ${protocol}`, async ({ page }) => {
    await shellFixture(page, { protocol, extraCapabilities: ['Transport'] })
    await navigate(page, 'Fleets')
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(page.locator('main h1')).toHaveText('Fleets')
    await page.getByRole('link', { name: 'Fleets', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await navigate(page, 'Fleets')
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(page.locator('main h1')).toHaveText('Fleets')
  })
}

test('mobile planet box is one tap target with rich planet and moon labels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  const purchases = await shellFixture(page, {
    bodies: [body, { ...body, id: id(6), kind: 'Moon' }],
  })
  const selector = page.getByRole('combobox', { name: 'Selected body' })
  const box = await selector.boundingBox()
  expect(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('aria-label'),
      {
        x: box!.x + 12,
        y: box!.y + box!.height / 2,
      },
    ),
  ).toBe('Selected body')
  await expect(selector).toHaveText(
    'Planet [1:371:12]',
  )
  await selectBody(page, id(6))
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/overview$`))
  await expect(selector).toHaveText('Moon [1:371:12]')
  await page.goBack()
  await expect(selector).toHaveAttribute('data-value', body.id)
  expect(purchases()).toBe(0)
})

test('small phone resource row fits large stocks and negative energy without stacking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await shellFixture(page, {
    bodies: [
      {
        ...body,
        amounts: {
          metal: '9223372036854775807',
          crystal: '999999999999999999',
          deuterium: '99999999999999',
        },
        energy: { supply: '0', demand: '999000000000000000', utilization: '0' },
      },
    ],
  })
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
    const resource = ledger.getByRole('button', { name: `${name} details` })
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

test('shipyard and defense show every batch in the same ordered queue', async ({
  page,
}) => {
  const now = Date.now()
  const batch = {
    id: id(10),
    body: body.id,
    item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
    quantity: '3',
    completed_prefix: '1',
    remaining: '2',
    paid: resources,
    accepted_at: now,
    first_start_at: now,
    next_due_at: now + 50000,
    final_due_at: now + 100000,
    unit_duration_ms: 50000,
    state: 'Producing' as const,
    can_cancel: false as const,
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page, {
    manufacturing: [
      {
        ...batch,
        id: id(12),
        item: { kind: 'Ship', id: 'LightFighter' },
        state: 'PaidQueued',
        first_start_at: now + 200000,
      },
      batch,
      {
        ...batch,
        id: id(11),
        item: { kind: 'Defense', id: 'RocketLauncher' },
        state: 'PaidQueued',
        first_start_at: now + 100000,
      },
      {
        ...batch,
        id: id(13),
        body: id(6),
        item: { kind: 'Ship', id: 'LargeCargo' },
      },
    ],
  })
  for (const destination of ['overview', 'shipyard', 'defense']) {
    await page.goto(`/u/andromeda/b/${body.id}/${destination}`)
    const scope = destination === 'overview' ? page.getByRole('article', { name: 'Planet [1:371:12] dossier', exact: true }) : page
    const queue = scope.getByRole('list', { name: 'Manufacturing queue' })
    await expect(queue.getByRole('listitem')).toHaveCount(3)
    await expect(queue.getByRole('listitem').nth(0)).toContainText(
      'Small Cargo · 2 remaining',
    )
    await expect(queue.getByRole('listitem').nth(0)).toContainText('Producing')
    await expect(queue.getByRole('listitem').nth(1)).toContainText(
      'Rocket Launcher · 2 remaining',
    )
    await expect(queue.getByRole('listitem').nth(1)).toContainText('Starts in')
    await expect(queue.getByRole('listitem').nth(2)).toContainText(
      'Light Fighter · 2 remaining',
    )
    await expect(queue).not.toContainText('Large Cargo')
  }
  await diagnosticScreenshot(page, {
    path: '/tmp/orbit-shared-manufacturing-queue.png',
    fullPage: true,
  })
})

for (const [kind, elapsed] of [
  ['construction', 0],
  ['construction', 60_000],
  ['research', 0],
  ['research', 60_000],
] as const) {
  test(`overview cancels active ${kind} after ${elapsed}ms and prevents duplicate cancellation`, async ({
    page,
  }) => {
    const serverNow = Date.now()
    await page.clock.install({ time: serverNow - 60_000 })
    await page.clock.pauseAt(serverNow)
    const options: NonNullable<Parameters<typeof shellFixture>[1]> = {
      sampledAt: serverNow,
      constructions:
        kind === 'construction'
          ? [
              {
                id: id(10),
                body: body.id,
                building: 'ResearchLab',
                target_level: 1,
                started_at: serverNow - elapsed,
                due_at: serverNow + 76000,
                paid: resources,
              },
            ]
          : [],
      researchOperation:
        kind === 'research'
          ? {
              id: id(10),
              host: body.id,
              research: 'EnergyTechnology',
              source_level: 0,
              target_level: 1,
              paid: resources,
              started_at: serverNow - elapsed,
              due_at: serverNow + 76000,
              labs: [],
              effective_lab: '1',
              can_cancel: true,
            }
          : null,
    }
    await shellFixture(page, options)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const sent = new Map<string, unknown>()
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON()
      sent.set(envelope.command_id, envelope.command)
      await gate
      options.constructions = []
      options.researchOperation = null
      await route.fulfill({
        json: {
          protocol: 3,
          binding,
          command_id: envelope.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: '1',
        },
      })
    })
    const scope = kind === 'construction' ? page.getByRole('article', { name: 'Planet [1:371:12] dossier', exact: true }) : page
    const summary = scope.getByRole('region', {
      name: kind === 'construction' ? 'Buildings' : 'Research',
      exact: true,
    })
    const cancel = summary.getByRole('button', {
      name: `Cancel ${kind}`,
      exact: true,
    })
    await cancel.click()
    if (elapsed >= 30_000) {
      await expect(page.getByRole('dialog')).toContainText('1 minute of work will be lost.')
      await confirmCancellation(page)
    } else await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(cancel).toBeDisabled()
    await expect(cancel).toHaveText('Cancelling…')
    await expect(summary).toContainText(
      kind === 'construction'
        ? 'Research Lab · Level 1'
        : 'Energy Technology · Level 1',
    )
    await expect(summary).toContainText(/1m \d+s/)
    await expect(summary).not.toContainText(`No ${kind} in progress.`)
    if (kind === 'construction')
      await expect(
        summary.getByRole('link', { name: 'Open buildings' }),
      ).toHaveAttribute('href', /\/facilities$/)
    expect([...sent.values()]).toEqual([
      {
        type: kind === 'construction' ? 'CancelConstruction' : 'CancelResearch',
        operation: id(10),
      },
    ])
    release()
    await expect(cancel).toHaveCount(0)
    await expect(
      summary.getByText(`No ${kind} in progress.`, { exact: true }),
    ).toBeVisible()
  })
}

test('compact shell exposes resource details and switches bodies without purchases', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const purchases = await shellFixture(page)
  const metal = page.getByRole('button', { name: 'Metal details' })
  await expect(metal).toBeVisible()
  await metal.focus()
  await expect(page.getByRole('dialog', { name: 'Metal' })).toContainText(
    '6,661',
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Metal' })).toHaveCount(0)
  await metal.click()
  await expect(page.getByRole('dialog', { name: 'Metal' })).toContainText(
    'Capacity',
  )
  await page.keyboard.press('Escape')
  const nav = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  })
  await expect(nav.getByRole('link')).toHaveText(['Empire', 'Develop'])
  await expect(
    nav.getByRole('button', { name: 'Fleets', exact: true }),
  ).toBeDisabled()
  await nav.getByRole('button', { name: 'Menu', exact: true }).click()
  const menu = page.getByRole('dialog', { name: 'Navigation' })
  await expect(menu.getByRole('button', { name: 'Alliance', exact: true })).toBeDisabled()
  await expect(menu.getByRole('button', { name: 'Galaxy' })).toBeDisabled()
  await expect(
    menu.getByRole('link', { name: 'Resources', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await selectBody(page, id(6))
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/overview$`))
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
  await page.goBack()
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(5))
  expect(purchases()).toBe(0)
})

test('desktop uses a persistent horizontal ledger and no permanent rails', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await shellFixture(page, { bodies: [body] })
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
    expect(bounds!.x).toBeGreaterThan(content!.x)
    expect(bounds!.x + bounds!.width).toBeCloseTo(content!.x + content!.width, 1)
    expect(bounds!.height).toBe(64)
    expect(
      (
        await bar.getByRole('button', { name: 'Metal details' }).innerText()
      ).trim(),
    ).toBe('6.6K')
  }
  const selector = await page.getByRole('combobox', { name: 'Selected body' }).boundingBox()
  const ledger = await page.getByLabel('Current resources').boundingBox()
  expect(
    Math.abs(
      selector!.y + selector!.height / 2 - ledger!.y - ledger!.height / 2,
    ),
  ).toBeLessThan(10)
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await expect(page).toHaveURL(/resources$/)
  await expect(
    page
      .getByRole('navigation', { name: 'Develop navigation' })
      .getByRole('link'),
  ).toHaveText(['Resources', 'Facilities', 'Research', 'Shipyard', 'Defense'])
})

test('shell fits desktop and touch viewports with keyboard menu restoration', async ({
  page,
}) => {
  await shellFixture(page)
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 1024],
    [390, 844],
    [360, 800],
    [320, 800],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height })
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: /^(Terms|Privacy|Universe settings)$/ }),
    ).toHaveCount(0)
    const brand = page.getByRole('link', {
      name: 'ORBIT IMPERIUM',
      exact: true,
      includeHidden: true,
    })
    const universe = page.getByLabel('Current universe')
    if (width < 768) {
      await expect(brand).toBeHidden()
      await expect(universe).toBeHidden()
      const ledger = await page.getByLabel('Current resources').boundingBox()
      const content = await page.locator('main').boundingBox()
      expect(content!.y - ledger!.y - ledger!.height).toBeLessThanOrEqual(2)
      expect(
        (await page.getByRole('combobox', { name: 'Selected body' }).boundingBox())!.y,
      ).toBeLessThan(24)
    } else {
      await expect(brand).toBeVisible()
      await expect(universe).toBeHidden()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const undersized = await page
      .locator('button,input:not([aria-hidden="true"]),select,summary,nav a,main a,aside a')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => {
            const r = n.getBoundingClientRect()
            // Ghost controls are intentionally compact; other touch targets stay 44px.
            const minimum = n.matches('[data-button-variant="ghost"]') || innerWidth >= 1024 ? 24 : 44
            return (
              r.width > 0 &&
              r.height > 0 &&
              (r.width < minimum || r.height < minimum)
            )
          })
          .map((n) => n.textContent),
      )
    expect(undersized, `${width}px control targets`).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/compact-shell-${width}.png`,
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(page.locator('main h1')).toBeFocused()
})

test('touch details show whole resources and remain usable with enlarged text', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await shellFixture(page)
  await page.getByRole('button', { name: 'Energy details' }).tap()
  await expect(page.getByRole('dialog', { name: 'Energy' })).toContainText('26')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Energy' })).toHaveCount(0)
  await page.addStyleTag({
    content:
      'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
  })

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Metal details' }).click()
  const popover = page.getByRole('dialog', { name: 'Metal' })
  await expect(popover).toContainText('6,661')
  const rect = await popover.boundingBox()
  expect(rect!.x).toBeGreaterThanOrEqual(0)
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(390)
  await diagnosticScreenshot(page, {
    path: 'test-results/compact-shell-text-size.png',
    fullPage: true,
  })
  await context.close()
})

test('world shell omits the utility row and opens defense production from its summary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await shellFixture(page, {
    protocol: 4,
    manufacturing: [
      {
        id: id(8),
        body: body.id,
        item: { kind: 'Defense', id: 'RocketLauncher' },
        quantity: '3',
        completed_prefix: '1',
        remaining: '2',
        paid: resources,
        accepted_at: Date.now(),
        first_start_at: Date.now(),
        next_due_at: Date.now() + 100000,
        final_due_at: Date.now() + 200000,
        unit_duration_ms: 100000,
        state: 'Producing',
        can_cancel: false,
      },
    ],
  })
  await expect(
    page.getByRole('link', { name: '0 active fleets · 1 incoming' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Planet information details' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Reports', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Rocket Launcher · 2 remaining')).toBeVisible()
  await expect(
    page.getByRole('article', { name: 'Planet [1:371:12] dossier', exact: true }).getByRole('link', { name: 'Open defenses' }),
  ).toHaveAttribute('href', /\/defense$/)
  await page.getByRole('article', { name: 'Planet [1:371:12] dossier', exact: true }).getByRole('link', { name: 'Open defenses' }).click()
  await expect(page.locator('main h1')).toHaveText('Defense')
})

test('phone has a stable thumb dock and a modal grouped menu with focus restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
  const nav = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  })
  await expect(nav.getByRole('link')).toHaveText(['Empire', 'Develop'])
  await expect(nav.getByRole('button')).toHaveText(['Galaxy', 'Fleets', 'Menu'])
  const dock = await nav.boundingBox()
  expect(dock!.y + dock!.height).toBe(844)
  const metal = await page
    .getByRole('button', { name: 'Metal details' })
    .boundingBox()
  const planet = await page.getByRole('combobox', { name: 'Selected body' }).boundingBox()
  expect(planet!.x + planet!.width).toBeLessThanOrEqual(metal!.x)
  expect(
    Math.abs(planet!.y + planet!.height / 2 - metal!.y - metal!.height / 2),
  ).toBeLessThan(2)
  const menu = nav.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Sign out' })).toBeVisible()
  const close = drawer.getByRole('button', { name: 'Close menu' })
  await expect(close).toBeFocused()
  await page.locator('main h1').focus()
  await expect(close).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  await menu.click()
  await page.mouse.click(2, 2)
  await expect(drawer).not.toBeVisible()
  await expect(menu).toBeFocused()
})

for (const width of [390, 1440]) {
  test(`account username appears beside sign out only in the menu at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await shellFixture(page)
    await page.route('**/api/auth/config', (route) =>
      route.fulfill({
        json: {
          mode: 'oidc',
          universes: [{ universe: binding.universe, name: 'Andromeda' }],
        },
      }),
    )
    await playerProfilesFixture(page, () => [
      { player: binding.player, username: 'eth' },
    ])
    await page.reload()
    const username = page.getByLabel('Username', { exact: true })
    await expect(username).toHaveText('eth')
    await expect(username).toBeHidden()
    await expect(
      page.getByRole('complementary', { name: 'Unbought account' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', {
        name: /Verify email|I’ve verified|Sign out everywhere/,
        includeHidden: true,
      }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Navigation' })
    await expect(drawer.getByLabel('Username', { exact: true })).toBeVisible()
    const signOut = drawer.getByRole('button', {
      name: 'Sign out',
      exact: true,
    })
    await expect(signOut).toBeVisible()
    const nameBounds = await username.boundingBox()
    const buttonBounds = await signOut.boundingBox()
    expect(nameBounds!.x + nameBounds!.width).toBeLessThan(buttonBounds!.x)
    expect(nameBounds!.y).toBeGreaterThanOrEqual(buttonBounds!.y)
    expect(nameBounds!.y + nameBounds!.height).toBeLessThanOrEqual(
      buttonBounds!.y + buttonBounds!.height,
    )
  })
}

test('resizing an open mobile sidebar releases modal focus and scroll locking', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  await menu.click()
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  await expect(drawer).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(drawer).not.toBeVisible()
  await menu.click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(page.locator('main h1')).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  await menu.click()
  await expect(drawer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeFocused()
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe('hidden')
})

test('mobile sidebar signs out through the existing account session', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('button', { name: 'Sign out' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0)
  await expect(page.getByLabel('Current resources')).toHaveCount(0)
})

test('overview preserves rich work, exact inventory, incoming visibility and responsive composition', async ({
  page,
}) => {
  const now = Date.now()
  const purchases = await shellFixture(page, {
    protocol: 4,
    bodies: [
      {
        ...body,
        coordinates: { galaxy: 1, system: 371, position: 4 },
        amounts: { ...resources, metal: '25216000000' },
        inventories: [
          {
            item: { kind: 'Ship', id: 'SmallCargo' },
            count: '9007199254740993',
          },
        ],
      },
    ],
    constructions: [
      {
        id: id(10),
        body: body.id,
        building: 'MetalMine',
        target_level: 2,
        due_at: now + 76000,
        paid: resources,
      },
    ],
    researchOperation: {
      id: id(11),
      host: body.id,
      research: 'EnergyTechnology',
      source_level: 0,
      target_level: 1,
      paid: resources,
      started_at: now - 100000,
      due_at: now + 145000,
      labs: [],
      effective_lab: '1',
      can_cancel: true,
    },
    manufacturing: [
      {
        id: id(12),
        body: body.id,
        item: { kind: 'Ship', id: 'SmallCargo' },
        quantity: '6',
        completed_prefix: '1',
        remaining: '5',
        paid: resources,
        accepted_at: now - 560000,
        first_start_at: now - 560000,
        next_due_at: now + 240000,
        final_due_at: now + 1840000,
        unit_duration_ms: 400000,
        state: 'Producing',
        can_cancel: false,
      },
    ],
  })
  await page.locator('summary').filter({ hasText: 'Orbital fleet' }).click()
  await expect(
    page.getByRole('region', { name: 'Orbital fleet' }),
  ).toContainText('9007199254740993')
  await expect(
    page.getByRole('region', { name: 'Fleet movements' }),
  ).toContainText('Ship composition unknown')
  await expect(
    page.getByRole('region', { name: 'Fleet movements' }).locator('time'),
  ).toHaveAttribute('datetime', /T/)
  for (const width of [1672, 390, 430]) {
    await page.setViewportSize({ width, height: width === 1672 ? 1100 : 844 })
    await page.locator('main img').evaluateAll(async (images) => {
      // Screenshot preparation also loads art inside the collapsed map.
      await Promise.all(images.map((image) => {
        const img = image as HTMLImageElement
        img.loading = 'eager'
        return img.decode().catch(() => {})
      }))
    })

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/foundation-overview-${width}.png`,
      fullPage: true,
    })
    await diagnosticScreenshot(page, {
      path: `test-results/foundation-viewport-${width}.png`,
    })
  }
  expect(purchases()).toBe(0)
})

test('navigation retains the ledger through cold art, rapid routes and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/art/**', (route) => route.abort())
  const purchases = await shellFixture(page, { protocol: 4 })
  await page
    .getByLabel('Current resources')
    .evaluate((element) =>
      element.setAttribute('data-persistent-check', 'same-ledger'),
    )
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await expect(page).toHaveURL(/resources$/)
  await page.getByRole('link', { name: 'Empire', exact: true }).click()
  await expect(page).toHaveURL(/overview$/)
  await expect(page.getByLabel('Current resources')).toHaveAttribute(
    'data-persistent-check',
    'same-ledger',
  )
  await expect(
    page.getByRole('heading', { name: 'Empire', exact: true }),
  ).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/resources$/)
  expect(purchases()).toBe(0)
})

test('large world rosters scroll and retain funding context on player-wide routes', async ({
  page,
}) => {
  const bodies = Array.from({ length: 12 }, (_, index) => ({
    ...body,
    id: index === 0 ? body.id : id(20 + index),
    coordinates: { galaxy: 1, system: index + 1, position: 4 },
  }))
  const purchases = await shellFixture(page, { bodies })
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Research', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Research')
  await selectBody(page, id(28))
  await expect(page).toHaveURL(new RegExp(`/b/${id(28)}/research$`))
  await expect(page.getByRole('searchbox', { name: 'Search owned worlds' })).toHaveCount(0)
  await page.goBack()
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', body.id)
  await page.setViewportSize({ width: 320, height: 844 })
  await selectBody(page, id(28))
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(28))
  expect(purchases()).toBe(0)
})

test('navigation keeps shell identity mounted through rapid route changes', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: process.env.ORBIT_TEST_SCREENSHOTS === '1' ? {
      dir: 'test-results/foundation-motion',
      size: { width: 1440, height: 900 },
    } : undefined,
  })
  const page = await context.newPage()
  const purchases = await shellFixture(page, { protocol: 4 })
  await page
    .getByLabel('Current resources')
    .evaluate((element) =>
      element.setAttribute('data-motion-check', 'persistent'),
    )
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Resources')
  await page
    .getByRole('navigation', { name: 'Develop navigation' })
    .getByRole('link', { name: 'Shipyard', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Shipyard')
  await page.getByRole('link', { name: 'Galaxy', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Galaxy')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/**/overview', async (route) => {
    await gate
    await route.fallback()
  })
  await page.route('**/art/**', (route) => route.abort())
  const pending = page.waitForRequest(
    (request) =>
      request.url().includes('/api/') && request.url().endsWith('/overview'),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await pending
  try {
    for (const heading of ['Shipyard', 'Resources', 'Empire']) {
      await page.goBack()
      await expect(page.locator('main h1')).toContainText(heading)
      await expect(page.getByLabel('Current resources')).toHaveAttribute(
        'data-motion-check',
        'persistent',
      )
    }
    await expect(
      page.getByRole('link', { name: 'Empire', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    expect(purchases()).toBe(0)
  } catch (error) {
    await attachFailureScreenshots([page], test.info())
    throw error
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await context.close()
  }
})

test('disconnection preserves selected world, ledger and urgent fleet navigation', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await page.route('**/api/**/overview', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(
    page.getByRole('alert').filter({ hasText: 'Connection interrupted' }),
  ).toBeVisible()
  await expect(page.getByLabel('Current resources')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', body.id)
  await page.getByRole('link', { name: 'Galaxy', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Galaxy')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Fleets', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Fleets')
  await expect(
    page.getByRole('heading', { name: 'Incoming fleets' }),
  ).toBeVisible()
})

test('fleet trajectory retains exact mission facts and requires recall review', async ({
  page,
}) => {
  const now = Date.now()
  const fleet = {
    id: id(61),
    origin: body.coordinates,
    destination: { galaxy: 1, system: 372, position: 10 },
    intent: {
      origin: body.id,
      destination: {
        type: 'Body' as const,
        id: id(60),
        expected_kind: 'Planet' as const,
        expected_owner: id(9),
      },
      mission: 'Transport' as const,
      ships: [
        { owner: binding.player, ship_type: 'SmallCargo' as const, count: '4' },
      ],
      cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
      speed_percent: 100 as const,
    },
    leg: 'Outbound' as const,
    ships: [{ ship_type: 'SmallCargo' as const, count: '4' }],
    cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
    due_at: now + 394000,
    launched_at: now - 100000,
    duration_ms: 494000,
    paid_fuel: '6000000',
    can_recall: true,
  }
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [fleet],
      incoming: [],
      score_value_micro: '12345000000000',
      fleet_slots: '5',
    },
  })
  let sent = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    sent++
    await gate
    await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  const mission = page.getByRole('article', { name: 'Transport fleet' })
  await mission.getByRole('button', { name: 'Transport ship composition: 4 ships', exact: true }).click()
  await expect(mission.getByRole('list', { name: 'Ship composition' }).getByRole('listitem')).toHaveText(['Small Cargo 4'])
  await expect(mission).toContainText('6m')
  await expect(mission).toContainText(/6m \d+s/)
  await expect(mission.locator('time')).toHaveAttribute(
    'datetime',
    new Date(fleet.due_at).toISOString(),
  )
  await expect(page.getByText('No visible incoming fleets.')).toBeVisible()
  await mission.getByRole('link', { name: 'Mission details' }).click()
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets/${fleet.id}`)
  // History updates before the lazy detail route commits. Wait for its screen
  // before using the shared selector, which still belongs to the outgoing list.
  await expect(
    page.getByRole('heading', { name: 'Mission details', exact: true }),
  ).toBeVisible()
  await selectBody(page, id(6))
  await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/fleets/${fleet.id}`)
  await page.reload()
  await expect(mission.getByRole('list', { name: 'Ship composition' }).getByRole('listitem')).toHaveText(['Small Cargo 4'])
  await page.goto(`/u/andromeda/fleets/${fleet.id}?body=${body.id}`)
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets/${fleet.id}`)
  await expect(mission).toContainText('2,000')
  await mission.getByText('Flight path', { exact: true }).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const diagram = mission.getByRole('figure', {
      name: 'Mission route schematic',
    })
    await diagram.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        diagram
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      )
      .toBe(true)
    for (const coordinate of ['[1:371:12]', '[1:372:10]']) {
      const label = diagram.getByText(coordinate, { exact: true })
      const bounds = await label.boundingBox()
      const stage = await diagram.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(stage!.x)
      expect(bounds!.y).toBeGreaterThanOrEqual(stage!.y)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        stage!.y + stage!.height,
      )
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        stage!.x + stage!.width,
      )
      expect(
        await label.evaluate((node) => {
          const range = document.createRange()
          range.selectNodeContents(node)
          return range.getClientRects().length
        }),
      ).toBe(1)
    }
    await diagnosticScreenshot(page, {
      path: `test-results/fleet-populated-${width}.png`,
      fullPage: true,
    })
    await diagnosticScreenshot(diagram, {
      path: `test-results/fleet-diagram-${width}.png`,
    })
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await mission
    .getByRole('button', { name: 'Review recall', exact: true })
    .scrollIntoViewIfNeeded()
  await mission.getByText('Flight path', { exact: true }).click()
  await diagnosticScreenshot(page, { path: 'test-results/fleet-facts-phone.png' })
  await expect(
    page.getByRole('link', { name: 'All fleets', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Review recall' }),
  ).toContainText('Estimated return if recalled now')
  expect(sent).toBe(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/fleet-recall-review-phone.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Keep mission', exact: true }).click()
  await page.route('**/art/**', (route) => route.abort())
  await page.reload()
  await expect(
    page.getByRole('article', { name: 'Transport fleet' })
      .getByRole('list', { name: 'Ship composition' }).getByRole('listitem'),
  ).toHaveText(['Small Cargo 4'])
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Review recall' }),
  ).toContainText('Fuel is not refunded')

  await page.getByRole('button', { name: 'Recall fleet', exact: true }).click()
  await expect.poll(() => sent).toBe(1)
  await expect(
    page.getByRole('button', { name: 'Recall requested', exact: true }),
  ).toBeDisabled()
  release()
})

test('reports distinguish zero, known empty and unrevealed historical observations', async ({
  page,
}) => {
  let reportRevision = 1
  const observed = Date.now() - 3600000
  const header = {
    id: id(62),
    kind: 'Espionage',
    observed_at: observed,
    read: false,
    hidden: false,
  }
  await shellFixture(page, {
    protocol: 4, extraCapabilities: ['Attack', 'Reports'],
    hasUnreadReports: () => !header.read,
    viewerRevision: () => String(reportRevision),
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON().gameplay
    expect(envelope.command).toEqual({ type: 'World', action: { type: 'MarkReportRead', report: header.id } })
    header.read = true
    reportRevision++
    await route.fulfill({ json: {
      protocol: 4, binding, command_id: envelope.command_id,
      admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed',
      result_ids: [], minimum_viewer_revision: String(reportRevision),
    } })
  })
  const payload = {
    kind: 'Espionage',
    target: {
      body: id(60),
      coordinates: { galaxy: 1, system: 372, position: 10 },
      owner: id(9),
      kind: 'Planet',
    },
    observed_at: observed,
    resources: {
      visibility: 'Known',
      value: { metal: '0', crystal: '120000000', deuterium: '0' },
    },
    fleet: { visibility: 'Known', value: [] },
    defenses: { visibility: 'Unknown' },
    buildings: { visibility: 'Unknown' },
    research: { visibility: 'Unknown' },
    activity: { type: 'None' },
    counterespionage: { probability_ppm: 0, detected: false },
  }
  let reportDetailRequests = 0
  let reportMode: 'populated' | 'empty' | 'failed' = 'populated'
  await page.route('**/api/**/reports**', async (route) => {
    const detail = new URL(route.request().url()).pathname.endsWith(header.id)
    if (detail) reportDetailRequests++
    if (reportMode === 'failed')
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    const request = route.request().postDataJSON()
    const context = request.context ?? request
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: detail
          ? { header, payload }
          : {
              items: reportMode === 'empty' ? [] : [header],
              has_more: false,
              next_cursor: null,
              as_of_ms: Date.now(),
            },
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  await expect(
    page.getByRole('link', { name: 'Espionage', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Historical observations stay as recorded.', {
      exact: false,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', { name: 'Show deleted reports' }),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/reports-list-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/reports-list-phone.png',
    fullPage: true,
  })
  await page.getByRole('link', { name: 'Espionage', exact: true }).click()
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report).toContainText('No stationed ships')
  await expect(report).toContainText(
    'Unknown — this observation did not reveal this section.',
  )
  await expect(report.getByText('0', { exact: true })).toHaveCount(2)
  await expect(page.getByText(/1 hour ago/)).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/reports-detail-${width}.png`,
      fullPage: true,
    })
  }
  const unreadAlert = page.getByRole('button', { name: 'Menu', exact: true }).getByRole('status', { name: 'Unread reports' })
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0)
  await expect(unreadAlert).toHaveCount(0)
  await expect.poll(() => header.read).toBe(true)
  await page
    .getByRole('button', { name: 'Attack', exact: true })
    .click()
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('system', '372'))
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('position', '10'))
  await expect(page.getByText(/Prepared from an observation/)).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-draft-phone.png',
    fullPage: true,
  })
  reportMode = 'empty'
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  await expect(page.getByText('No reports to show.', { exact: true })).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/reports-empty-phone.png',
    fullPage: true,
  })
  // Legacy URLs remount the report during canonicalization. Keep this retry
  // scenario on the final route so a redirect cannot consume its recovery.
  reportDetailRequests = 0
  reportMode = 'failed'
  await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
  await expect(
    page.getByRole('button', { name: 'Retry reports', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/reports-unavailable-phone.png',
    fullPage: true,
  })
  expect(reportDetailRequests).toBe(1)
  reportMode = 'populated'
  await page.getByRole('button', { name: 'Retry reports', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toContainText('No stationed ships')
  expect(reportDetailRequests).toBe(2)
})

test('secondary pages retain empty, unavailable and settings states at phone width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      fleet_slots: '1',
      score_value_micro: '0',
    },
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  await expect(page.getByText('No active fleets.')).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/fleets-empty-phone.png',
    fullPage: true,
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets/${id(99)}`)
  await expect(
    page.getByText(
      'This item is unavailable or outside the current authorized view.',
    ),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/fleets-unavailable-phone.png',
    fullPage: true,
  })
  await page.goto(`/u/andromeda/settings?body=${body.id}`)
  await expect(
    page.getByRole('heading', { name: 'Universe settings', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Session actions' })
      .getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/settings-phone.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/settings-desktop.png',
    fullPage: true,
  })
})

test('dispatch fences changed drafts and keeps uncertain launch recovery in action notices', async ({
  page,
}) => {
  // Count explicit review requests without racing the background flight estimate.
  // Flight timing has separate coverage; recovery below is requested explicitly.
  const now = new Date()
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  await shellFixture(page, {
    protocol: 4,
    catalog: [
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
      },
    ],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
  })
  let quoteRequests = 0
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const destination = {
    type: 'Body',
    id: id(60),
    expected_owner: id(9),
    expected_kind: 'Planet',
  }
  await page.route('**/world', async (route) => {
    const query = route.request().postDataJSON()
    if (query.type === 'FleetQuote') quoteRequests++
    if (
      query.type === 'ResolveDestination' &&
      query.selection.coordinates.position === 2
    )
      await gate
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: query.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data:
          query.type === 'ResolveDestination'
            ? destination
            : {
                intent: query.intent,
                profile_hash: 'a'.repeat(64),
                distance: 1000,
                speeds: [['SmallCargo', '5000']],
                duration_ms: 120000,
                fuel: '6000000',
                capacity: '5000000000',
                maximum_payload: '4994000000',
                slot_limit: '5',
                terms_hash: 'b'.repeat(64),
              },
      },
    })
  })
  let sent = 0
  await page.route('**/commands', async (route) => {
    sent++
    await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  // Receipt reads share the simulated outage. The default fixture's 404 would
  // correctly trigger redelivery of the saved command during reconciliation.
  await page.route('**/commands/*?epoch=*', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  await setDestination(page, { position: '2' })
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await setDestination(page, { position: '3' })
  release()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toContainText('Unknown planet')
  await expect(quote.getByRole('link', { name: 'View destination [1:1:3] in galaxy', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/galaxy?galaxy=1&system=1&position=3`)
  await expect(quote.getByRole('img', { name: 'Deuterium', exact: true }).last().locator('..')).toHaveText('6')
  await expect(quote).toContainText('fuel')
  expect(quoteRequests).toBe(1)
  expect(sent).toBe(0)
  await page.setViewportSize({ width: 1440, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-review-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-review-phone.png',
    fullPage: true,
  })
  await quote.getByRole('button', { name: 'Edit mission', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Review fleet', exact: true }),
  ).toBeFocused()
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(quote).toBeVisible()
  await quote
    .getByRole('button', { name: 'Transport to Unknown planet [1:1:3]', exact: true })
    .click()
  await expect(
    page.getByRole('complementary', { name: 'Action needs attention' }),
  ).toContainText('Response uncertain. Your action is saved.')
  await expect(
    page.getByRole('button', { name: 'Resolve saved command', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel(/Small Cargo · \d+ available/)).toHaveValue('1')
  await expect(
    page.getByRole('complementary', { name: 'Departure context' }),
  ).toContainText('Fleet slots: 1 used / 5 total')
  const recovery = page.getByLabel('Action needs attention')
  // Exercise recovery explicitly so this assertion does not depend on whether
  // the background receipt poll runs before the layout checks finish.
  const receiptResponse = page.waitForResponse((response) =>
    response.url().includes('/commands/') && response.request().method() === 'GET',
  )
  await recovery.getByRole('button', {
    name: 'Resolve saved command',
    exact: true,
  }).click()
  expect((await receiptResponse).status()).toBe(503)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(
      await recovery.evaluate((element) => getComputedStyle(element).position),
    ).toBe('static')
    // Read both boxes in one frame: resize and focus restoration can change
    // scroll/header offsets between separate browser round trips.
    const bounds = await page
      .getByText(/^Fleet slots: .* used \/ .* total$/)
      .first()
      .evaluate((intro) => {
        const notice = document.querySelector('aside[aria-label="Action needs attention"]')!
        return {
          noticeBottom: notice.getBoundingClientRect().bottom,
          introTop: intro.getBoundingClientRect().top,
        }
      })
    expect(bounds.noticeBottom).toBeLessThanOrEqual(bounds.introTop)
    for (const control of [
      page.getByRole('combobox', { name: 'Selected body' }),
      page.getByRole('button', { name: 'Menu', exact: true }),
      page.getByRole('link', { name: 'Fleets', exact: true }),
    ]) {
      await expect(control).toBeInViewport()
      expect(
        await control.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          )
          return element === hit || element.contains(hit)
        }),
      ).toBe(true)
    }
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
    await page.keyboard.press('Escape')
    const resolve = recovery.getByRole('button', {
      name: 'Resolve saved command',
      exact: true,
    })
    await resolve.scrollIntoViewIfNeeded()
    await expect(resolve).toBeInViewport()
  }
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(quote.getByRole('img', { name: 'Deuterium', exact: true }).last().locator('..')).toHaveText('6')
  await expect(quote).toContainText('fuel')
  await expect(
    quote.getByRole('button', { name: 'Transport to Unknown planet [1:1:3]', exact: true }),
  ).toBeDisabled()
  expect(sent).toBe(1)

  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-uncertain-phone.png',
    fullPage: true,
  })
})

test('legacy fleets retain trajectory, exact arrival and reviewed recall', async ({
  page,
}) => {
  const due = Date.now() + 120000
  await shellFixture(page, {
    protocol: 2,
    extraCapabilities: ['Transport'],
    fleets: [
      {
        id: id(61),
        origin: body.id,
        target: id(60),
        status: 'Outbound',
        due_at: due,
        payload: resources,
        paid_fuel: '3000000',
        ships: [{ ship_type: 'SmallCargo', count: '2' }],
      },
    ],
    destinations: [
      { id: body.id, coordinates: body.coordinates, kind: 'Planet' },
      {
        id: id(60),
        coordinates: { galaxy: 1, system: 372, position: 10 },
        kind: 'Planet',
      },
    ],
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  await expect(
    page.getByRole('figure', { name: 'Mission route schematic' }),
  ).toBeVisible()
  await expect(page.locator('main time')).toHaveAttribute(
    'datetime',
    new Date(due).toISOString(),
  )
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Recall transport' }),
  ).toContainText('server confirms the return time')
  await expect(
    page.getByRole('button', { name: 'Recall fleet', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keep mission', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Recall fleet', exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await diagnosticScreenshot(page, {
    path: 'test-results/legacy-fleet-phone.png',
    fullPage: true,
  })
})

test('selected body context truncates on phones and retains full labels and accessible route focus', async ({
  page,
}) => {
  const selected = {
    ...body,
    coordinates: { galaxy: 1, system: 499, position: 15 },
  }
  await shellFixture(page, {
    bodies: [selected, { ...body, id: id(6), kind: 'Moon' }],
  })
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const text = page
      .getByRole('combobox', { name: 'Selected body' })
      .getByText('Planet', { exact: true }).locator('..')
    await expect(text).toHaveText('Planet [1:499:15]')
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveText('Planet [1:499:15]')
    if (width < 768) {
      for (const part of await text.locator('span').all()) {
        await expect(part).toHaveCSS('text-overflow', 'ellipsis')
        await expect(part).toHaveCSS('overflow', 'hidden')
        expect((await part.boundingBox())!.width).toBeLessThan(70)
      }
    } else {
      expect(
        await text.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const bounds = element.getBoundingClientRect()
          return [...range.getClientRects()].every(
            (rect) =>
              rect.left >= bounds.left &&
              rect.right <= bounds.right &&
              rect.right <= innerWidth,
          )
        }),
      ).toBe(true)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
  await page.addStyleTag({ content: 'html { font-size: 200% }' })
  const text = page
    .getByRole('combobox', { name: 'Selected body' })
    .getByText('Planet', { exact: true }).locator('..')
  expect(
    await text.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  const heading = page.getByRole('heading', {
    name: 'Resources',
    exact: true,
    level: 1,
  })
  await expect(heading).toBeFocused()
  expect(
    (await heading.locator('..').boundingBox())!.height,
  ).toBeLessThanOrEqual(1)
  await expect(
    page.getByRole('heading', { name: 'Resources', level: 2 }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Planet information details' }),
  ).toHaveCount(0)
  await page.goto(`/u/andromeda/b/${id(99)}/resources`)
  const unavailable = page.getByRole('heading', {
    name: 'Destination unavailable',
    exact: true,
    level: 1,
  })
  await expect(unavailable).toBeVisible()
  expect((await unavailable.boundingBox())!.height).toBeGreaterThan(20)
})

for (const width of [390, 1440]) {
  test(`construction stays in queues and details without a shared footer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await shellFixture(page, {
      constructions: [{
        id: id(10), body: body.id, building: 'MetalMine', target_level: 2,
        due_at: Date.now() + 76000, paid: resources,
      }],
    })
    for (const route of [
      `/u/andromeda/b/${body.id}/resources`,
      `/u/andromeda/b/${body.id}/facilities`,
      `/u/andromeda/b/${body.id}/research`,
      `/u/andromeda/b/${body.id}/shipyard`,
      `/u/andromeda/b/${body.id}/defense`,
      `/u/andromeda/settings`,
    ]) {
      await page.goto(route)
      await expect(page.locator('main h1')).toBeAttached()
      await expect(page.getByRole('region', { name: 'Construction status', includeHidden: true })).toHaveCount(0)
      // Construction controls are contained in the page, never appended to the shell.
      expect(await page.getByRole('button', { name: 'Cancel construction', includeHidden: true }).evaluateAll(
        buttons => buttons.every(button => button.closest('main') !== null),
      )).toBe(true)
    }
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const work = page.getByRole('region', { name: 'Buildings', exact: true })
    await expect(work).toContainText('Metal Mine · Level 2')
    await expect(work.getByRole('button', { name: 'Cancel construction' })).toBeEnabled()
    await page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }).click()
    const detail = page.getByRole('region', { name: 'Active construction' })
    await expect(detail.getByRole('heading', { name: 'Upgrading Metal Mine to level 2', exact: true })).toBeVisible()
    await expect(detail.getByRole('button', { name: 'Cancel construction' })).toBeEnabled()
  })
}

test('phone Develop navigation keeps full-size links on one keyboard-scrollable row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
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

test('failed world images settle without browser broken-image borders or lost controls', async ({
  page,
}) => {
  await page.route('**/art/**', (route) => route.abort())
  await shellFixture(page)
  const art = page.locator('img[src*="/art/"]')
  await art.evaluateAll(images => images.forEach(image => image.setAttribute('loading', 'eager')))
  await expect
    .poll(() =>
      art.evaluateAll((images) =>
        images.every(
          (image) =>
            image instanceof HTMLImageElement &&
            image.complete &&
            !image.naturalWidth &&
            (getComputedStyle(image).opacity === '0' || getComputedStyle(image).visibility === 'hidden'),
        ),
      ),
    )
    .toBe(true)
  await expect(page.getByRole('combobox', { name: 'Selected body' })).toBeVisible()
  await expect(page.getByLabel('Current resources')).toBeVisible()
  await page.getByRole('link', { name: 'Develop', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Resources')
})

test('server recall eligibility survives an elapsed client countdown', async ({
  page,
}) => {
  const now = Date.now()
  const fleet = {
    id: id(61),
    origin: body.coordinates,
    destination: { galaxy: 1, system: 372, position: 10 },
    intent: {
      origin: body.id,
      destination: {
        type: 'Body' as const,
        id: id(60),
        expected_kind: 'Planet' as const,
        expected_owner: id(9),
      },
      mission: 'Transport' as const,
      ships: [
        { owner: binding.player, ship_type: 'SmallCargo' as const, count: '4' },
      ],
      cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
      speed_percent: 100 as const,
    },
    leg: 'Outbound' as const,
    ships: [{ ship_type: 'SmallCargo' as const, count: '4' }],
    cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
    due_at: now + 394000,
    launched_at: now - 100000,
    duration_ms: 494000,
    paid_fuel: '6000000',
    can_recall: true,
  }
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [fleet],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
  })
  const sent: unknown[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope.gameplay?.command ?? envelope.command)
    await gate
    await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  await page.route('**/overview', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  await expect(
    page.getByRole('article', { name: 'Transport fleet' }),
  ).toBeVisible()
  await page.clock.install()
  await page.clock.fastForward(400000)
  await expect(
    page.getByRole('article', { name: 'Transport fleet' }),
  ).toContainText('Awaiting confirmation')
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Review recall' }),
  ).toContainText('The server will confirm the return time')
  const recall = page.getByRole('button', { name: 'Recall fleet', exact: true })
  await expect(recall).toBeEnabled()
  await recall.click()
  await expect
    .poll(() => sent)
    .toEqual([
      { type: 'World', action: { type: 'RecallMission', fleet: fleet.id } },
    ])
  await expect(
    page.getByRole('button', { name: 'Recall requested', exact: true }),
  ).toBeDisabled()
  release()
})

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const width of [390, 1280]) {
    test(`navigation and menus have no motion at ${width}px with ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ reducedMotion })
      await page.addInitScript(() => {
        const events: string[] = []
        Object.assign(window, { uiMotionEvents: events })
        document.addEventListener('animationstart', event => { if (!(event.target instanceof Element && event.target.closest('[data-command-hud]'))) events.push('animation') }, true)
        document.addEventListener('transitionrun', event => { if (!(event.target instanceof Element && event.target.closest('[data-command-hud]'))) events.push('transition') }, true)
        const start = document.startViewTransition.bind(document)
        document.startViewTransition = (...args) => {
          events.push('view-transition')
          return start(...args)
        }
      })
      // Navigation stays motionless; the explicitly animated command HUD is
      // checked separately, and the intentional hostile-fleet signal has
      // its own coverage, so keep this fixture free of incoming threats.
      const purchases = await shellFixture(page, {
        protocol: 4,
        missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' },
      })
      const assertStill = async () => {
        expect(await page.evaluate(() => document.getAnimations().filter(animation => { const target = (animation.effect as KeyframeEffect | null)?.target; return !(target instanceof Element && target.closest('[data-command-hud]')) }).length)).toBe(0)
        expect(await page.evaluate(() => (window as Window & { uiMotionEvents: string[] }).uiMotionEvents)).toEqual([])
      }
      await assertStill()
      for (const [name, heading] of [['Resources', 'Resources'], ['Fleets', 'Fleets'], ['Empire', 'Empire']]) {
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
        const drawer = page.getByRole('dialog', { name: 'Navigation' })
        await expect(drawer).toBeVisible()
        await assertStill()
        const link = drawer.getByRole('link', { name, exact: true })
        await link.hover()
        await assertStill()
        await link.click()
        await expect(page.locator('main h1')).toContainText(heading)
        await expect(page.locator('main h1')).toBeFocused()
        await expect(drawer).not.toBeVisible()
        await assertStill()
      }
      await assertStill()
      expect(purchases()).toBe(0)
    })
  }
}


for (const width of [320, 390, 768, 1024, 1440]) {
  for (const textScale of [1, 2]) {
    test(`unread reports light the menu and report link at ${width}px with ${textScale * 100}% text and reconcile`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      let unread = false
      let revision = 1
      await shellFixture(page, {
        protocol: 4,
        extraCapabilities: ['Reports'],
        hasUnreadReports: () => unread,
        viewerRevision: () => String(revision),
      })
      await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% !important; }` })
      const menu = page.getByRole('button', { name: 'Menu', exact: true })
      const alert = menu.getByRole('status', { name: 'Unread reports' })
      const assertLayout = async () => {
        const target = (await menu.boundingBox())!
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
        await expect(menu).toBeInViewport({ ratio: 1 })
        const label = (await menu.getByText('Menu', { exact: true }).boundingBox())!
        expect(label.x).toBeGreaterThanOrEqual(target.x)
        expect(label.x + label.width).toBeLessThanOrEqual(target.x + target.width)
        if (await alert.count()) {
          const badge = (await alert.boundingBox())!
          // Either beside the desktop label or above the mobile label, with a gap.
          expect(badge.x >= label.x + label.width + 4 || badge.y + badge.height + 4 <= label.y).toBe(true)
          expect(badge.x).toBeGreaterThanOrEqual(target.x)
          expect(badge.x + badge.width).toBeLessThanOrEqual(target.x + target.width)
          expect(badge.y).toBeGreaterThanOrEqual(target.y)
          expect(badge.y + badge.height).toBeLessThanOrEqual(target.y + target.height)
        }
      }
      await expect(alert).toHaveCount(0)
      await assertLayout()
      unread = true
      revision++
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(alert).toBeVisible()
      await expect(menu).toHaveAccessibleDescription('Unread reports')
      await diagnosticScreenshot(page, { path: `test-results/unread-reports-${width}-${textScale}.png` })
      await assertLayout()
      await menu.focus()
      await page.keyboard.press('Enter')
      const reports = page.getByRole('link', { name: 'Reports — unread reports' })
      await expect(reports).toBeVisible()
      await expect(reports.locator('svg')).toHaveCount(2)
      await diagnosticScreenshot(page, { path: `test-results/unread-report-menu-${width}-${textScale}.png` })
      await reports.focus()
      await expect(reports).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(menu).toBeFocused()
      await page.reload()
      await page.addStyleTag({ content: `html { font-size: ${textScale * 100}% !important; }` })
      await expect(alert).toBeVisible()
      await assertLayout()
      unread = false
      revision++
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(alert).toHaveCount(0)
      await menu.click()
      await expect(page.getByRole('link', { name: 'Reports', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Reports — unread reports' })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await assertLayout()
    })
  }
}

for (const width of [768, 1024, 1440, 1800]) {
  test(`desktop header keeps name, planet, menu and resources in one pinned row at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    await shellFixture(page, { protocol: 4 })
    const brand = page.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true })
    const primary = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    const planet = page.getByRole('combobox', { name: 'Selected body' })
    const resources = page.getByLabel('Current resources')
    const header = brand.locator('../..')
    await expect(page.getByLabel('Current universe')).toBeHidden()
    const assertRow = async () => {
      const boxes = await Promise.all([brand, planet, primary, resources].map(locator => locator.boundingBox()))
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i]!.x).toBeGreaterThanOrEqual(boxes[i - 1]!.x + boxes[i - 1]!.width)
        expect(Math.abs(boxes[i]!.y + boxes[i]!.height / 2 - boxes[0]!.y - boxes[0]!.height / 2)).toBeLessThan(2)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await header.boundingBox())!.y).toBe(0)
    }
    await assertRow()
    await expect(page.getByRole('navigation', { name: /^(Develop|Fleet) navigation$/ })).toHaveCount(0)
    for (const group of ['Develop', 'Galaxy', 'Fleets']) {
      await primary.getByRole('link', { name: group, exact: true }).click()
      const secondary = page.getByRole('navigation', { name: `${group} navigation`, exact: true })
      if (group !== 'Develop') {
        await expect(secondary).toHaveCount(0)
        for (const scroll of [0, 300, 100000]) {
          await page.evaluate(y => window.scrollTo(0, y), scroll)
          await assertRow()
        }
        continue
      }
      await expect(secondary).toBeVisible()
      const row = (await primary.boundingBox())!
      expect((await secondary.boundingBox())!.y).toBe(row.y + row.height)
      for (const scroll of [0, 300, 100000]) {
        await page.evaluate(y => window.scrollTo(0, y), scroll)
        await assertRow()
        expect((await secondary.boundingBox())!.y).toBe(row.y + row.height)
      }
    }
    await page.getByRole('button', { name: 'Metal details', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Metal', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await selectBody(page, id(6))
    await expect(planet).toHaveAttribute('data-value', id(6))
    await primary.getByRole('link', { name: 'Develop', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Resources')
    await page.mouse.move(width / 2, 300)
    await diagnosticScreenshot(page, { path: `test-results/desktop-pinned-header-${width}.png` })
  })
}

for (const width of [768, 1024, 1440, 1800]) {
  test(`desktop brand stays aligned with a large world roster at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width, height: 900 })
    const bodies = Array.from({ length: 9 }, (_, index) => ({
      ...body,
      id: index === 0 ? body.id : id(index + 20),
      coordinates: { galaxy: 1, system: 371, position: index + 1 },
    }))
    await shellFixture(page, { protocol: 4, bodies })
    const brand = page.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true })
    const primary = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    const planet = page.getByRole('combobox', { name: 'Selected body' })
    const resources = page.getByLabel('Current resources')
    const search = page.getByRole('searchbox', { name: 'Search owned worlds' })
    await expect(search).toHaveCount(0)
    const assertAlignment = async () => {
      const brandBox = (await brand.boundingBox())!
      for (const locator of [planet, primary, resources]) {
        const box = (await locator.boundingBox())!
        expect(Math.abs(box.y + box.height / 2 - brandBox.y - brandBox.height / 2)).toBeLessThan(2)
      }
      expect((await brand.locator('../..').boundingBox())!.y).toBe(0)
    }
    await assertAlignment()
    await primary.getByRole('link', { name: 'Develop', exact: true }).click()
    const secondary = page.getByRole('navigation', { name: 'Develop navigation', exact: true })
    await expect(secondary).toBeVisible()
    for (const scroll of [0, 300, 100000]) {
      await page.evaluate(y => window.scrollTo(0, y), scroll)
      await assertAlignment()
      const row = (await primary.boundingBox())!
      expect((await secondary.boundingBox())!.y).toBeGreaterThanOrEqual(row.y + row.height)
    }
    await selectBody(page, bodies[8].id)
    await expect(planet).toHaveAttribute('data-value', bodies[8].id)
    await assertAlignment()
  })
}

test.describe('planet-scoped gameplay routes retain context and redirect old query URLs', () => {
  for (const [path, heading] of [['research', 'Research'], ['fleets', 'Fleets'], ['galaxy', 'Galaxy'], ['dispatch', 'Dispatch'], ['reports', 'Reports']]) {
    test(path, async ({ page }) => {
      const purchases = await installGameFixture(page, { protocol: 4 })
      await page.goto(`/u/andromeda/${path}?body=${body.id}`)
      await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/${path}`)
      await expect(page.locator('main h1')).toHaveText(heading)
      await selectBody(page, id(6))
      await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/${path}`)
      await page.reload()
      await expect(page.getByRole('combobox', { name: 'Selected body' })).toHaveAttribute('data-value', id(6))
      await expect(page.locator('main h1')).toHaveText(heading)
      await page.goto(`/u/andromeda/b/${id(99)}/${path}`)
      await expect(page.getByRole('heading', { name: 'Destination unavailable', exact: true })).toBeVisible()
      await expect(page).toHaveURL(`/u/andromeda/b/${id(99)}/${path}`)
      expect(purchases()).toBe(0)
    })
  }
})

for (const width of [320, 390, 1440]) {
  test(`active building and research summaries use two tight lines at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const now = Date.now()
    await page.clock.setFixedTime(now)
    await shellFixture(page, {
      constructions: [{ id: id(10), body: body.id, building: 'RoboticsFactory', target_level: 3, due_at: now + 35000, paid: resources }],
      researchOperation: { id: id(11), host: body.id, research: 'EnergyTechnology', source_level: 2, target_level: 3, paid: resources, started_at: now - 1000, due_at: now + 35000, labs: [], effective_lab: '1', can_cancel: true },
    })
    for (const [path, region, label] of [
      ['facilities', 'Buildings', 'Robotics Factory · Level 3'],
      ['research', 'Research', 'Energy Technology · Level 3'],
    ]) {
      await page.goto(`/u/andromeda/b/${body.id}/${path}`)
      const queue = page.getByRole('region', { name: region, exact: true })
      const link = queue.getByRole('link', { name: new RegExp(label) })
      await expect(link).toBeVisible()
      await expect(queue).not.toContainText('In progress')
      const lines = await link.locator(':scope > span').all()
      expect(lines).toHaveLength(2)
      await expect(lines[0]).toHaveText(label)
      // The real server fixture clock advances while pages load; formatting is unit-tested separately.
      await expect(lines[1]).toHaveText(/^\d+s$/)
      const seconds = parseInt((await lines[1].textContent())!, 10)
      expect(seconds).toBeGreaterThan(0)
      expect(seconds).toBeLessThanOrEqual(35)
      const first = (await lines[0].boundingBox())!
      const second = (await lines[1].boundingBox())!
      expect(second.y - (first.y + first.height)).toBeLessThanOrEqual(2)
      const bounds = (await link.boundingBox())!
      expect(bounds.height).toBeGreaterThanOrEqual(44)
      expect(bounds.height).toBeLessThanOrEqual(45)
      expect((await queue.boundingBox())!.height).toBeLessThanOrEqual(62)
      await expect(queue.getByRole('button', { name: /^Cancel / })).toBeEnabled()
      await diagnosticScreenshot(queue, { path: `test-results/compact-work-${path}-${width}.png` })
    }
  })
}

test('empty reports wait for a successful response and offer planet-aware navigation at every size', async ({
  page,
}) => {
  let revision = 1
  let requests = 0
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
  })
  let release!: () => void
  let pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/**/reports', async (route) => {
    requests++
    await pending
    const request = route.request().postDataJSON()
    const context = request.context ?? request
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          items: [],
          has_more: false,
          next_cursor: null,
          as_of_ms: Date.now(),
        },
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  await expect(page.getByText('Loading report history…')).toBeVisible()
  const empty = page.getByRole('region', { name: 'No reports to show.' })
  await expect(empty).toHaveCount(0)
  release()
  await expect(empty).toBeVisible()
  await expect(empty).toContainText(
    'Fleet arrivals, espionage findings, and battle outcomes',
  )
  const explore = empty.getByRole('link', { name: 'Explore the galaxy' })
  await expect(explore).toHaveAttribute(
    'href',
    `/u/andromeda/b/${body.id}/galaxy`,
  )
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(explore).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/reports-empty-${width}.png`,
      fullPage: true,
    })
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%'
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ''
  })
  const beforeRefresh = await empty.boundingBox()
  const previousRequests = requests
  pending = new Promise<void>((resolve) => {
    release = resolve
  })
  revision++
  try {
    await refreshGame(page)
    await expect.poll(() => requests).toBeGreaterThan(previousRequests)
    await expect(empty).toBeVisible()
    expect(await empty.boundingBox()).toEqual(beforeRefresh)
  } finally {
    release()
  }
  await explore.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/galaxy$`))
  await page.goBack()
  await expect(empty).toBeVisible()
})

test('failed report requests do not claim the archive is empty', async ({
  page,
}) => {
  await installGameFixture(page, { protocol: 4 })
  await page.route('**/api/**/reports', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  await expect(
    page.getByRole('button', { name: 'Retry reports' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'No reports to show.' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Explore the galaxy' }),
  ).toHaveCount(0)
})

test('incoming attacks stay in the phone viewport when there are no outgoing fleets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 667 })
  await installGameFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [
        {
          sender: id(99),
          origin: { galaxy: 1, system: 400, position: 9 },
          target: body.id,
          mission: 'Attack',
          arrival_at: Date.now() + 95000,
          ships: { visibility: 'Unknown' },
        },
      ],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  await expect(
    page.getByRole('heading', { name: 'No active fleets.' }),
  ).toBeVisible()
  const incoming = page.getByRole('region', { name: 'Incoming fleets' })
  const attack = incoming.getByRole('heading', { name: /Incoming attack/ })
  await expect(attack).toBeInViewport()
  const dock = await page
    .getByRole('navigation', { name: 'Main navigation' })
    .boundingBox()
  const arrival = await attack.boundingBox()
  expect(arrival!.y + arrival!.height).toBeLessThan(dock!.y)
  await diagnosticScreenshot(page, {
    path: 'test-results/fleet-empty-incoming-phone.png',
  })
})

for (const width of [320, 390, 1440]) {
  test(`rich planet selector shows acquisition order and supports keyboard and pointer at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const home = {
      ...body,
      name: 'Martialis',
      coordinates: { galaxy: 1, system: 19, position: 6 },
    }
    const colony = (n: number, name: string, created_at: number) => ({
      ...body,
      id: id(n),
      name,
      coordinates: { galaxy: 1, system: 1, position: n - 5 },
      colony: {
        created_at,
        diameter_km: 12000,
        min_temperature: 0,
        max_temperature: 40,
        profile: 'oi-redesign-reconstructed-v1',
      },
    })
    const first = colony(8, 'Nova Roma', 100)
    const later = colony(9, 'A long planet name that wraps safely', 200)
    const moon = { ...home, id: id(10), name: undefined, kind: 'Moon' as const }
    const purchases = await shellFixture(page, {
      protocol: 4,
      bodies: [later, moon, first, home],
    })
    await page.goto(`/u/andromeda/b/${home.id}/overview`)
    const trigger = page.getByRole('combobox', { name: 'Selected body' })
    await expect(trigger).toContainText('Martialis')
    await expect(trigger).toHaveAttribute('data-value', home.id)
    await expect(
      page.getByRole('searchbox', { name: 'Search owned worlds' }),
    ).toHaveCount(0)
    await trigger.click()
    const list = page.getByRole('listbox')
    const options = page.getByRole('option')
    await expect(options).toHaveText([
      'Martialis [1:19:6]',
      'Moon [1:19:6]',
      'Nova Roma [1:1:3]',
      'A long planet name that wraps safely [1:1:4]',
    ])
    await expect(options.first()).toHaveAttribute('aria-selected', 'true')
    await expect(options.first().locator('svg')).toHaveClass(/lucide-check/)
    for (const option of await options.all()) {
      await expect(option.locator('img')).toBeVisible()
      await expect
        .poll(() =>
          option
            .locator('img')
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0)
    }
    const box = (await list.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(900)
    await diagnosticScreenshot(page, {
      path: `test-results/planet-select-${width}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(list).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('data-value', home.id)
    await trigger.press('Enter')
    await expect(options.first()).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('data-value', first.id)
    await expect(page).toHaveURL(new RegExp(`/b/${first.id}/overview$`))
    await page.goBack()
    await expect(trigger).toHaveAttribute('data-value', home.id)
    await trigger.press('Enter')
    await expect(options.first()).toBeFocused()
    await page.keyboard.press('n')
    await expect(options.nth(2)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('data-value', first.id)
    await selectBody(page, later.id)
    await page.reload()
    await expect(trigger).toHaveAttribute('data-value', later.id)
    await trigger.click()
    // Opening mounts the popup and its outside-press listeners asynchronously.
    // Wait for the selected option to receive focus before clicking outside.
    await expect(options.last()).toBeFocused()
    await page.mouse.click(width - 10, 800)
    await expect(list).toHaveCount(0)
    await expect(trigger).toHaveAttribute('data-value', later.id)
    expect(purchases()).toBe(0)
  })
}

test('rich planet selector scrolls a large roster and selects by touch in a short viewport', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 480 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  try {
    const bodies = Array.from({ length: 12 }, (_, index) => ({
      ...body,
      id: index === 0 ? body.id : id(20 + index),
      name: `World ${index + 1}`,
      coordinates: { galaxy: 1, system: 1, position: index + 1 },
    }))
    const purchases = await shellFixture(page, { bodies })
    const trigger = page.getByRole('combobox', { name: 'Selected body' })
    await trigger.tap()
    const list = page.getByRole('listbox')
    await expect(list).toBeVisible()
    const box = (await list.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    expect(box.y + box.height).toBeLessThanOrEqual(480)
    expect(
      await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    ).toBe(true)
    const last = page.getByRole('option', {
      name: 'World 12 [1:1:12]',
      exact: true,
    })
    await last.scrollIntoViewIfNeeded()
    await last.tap()
    await expect(trigger).toHaveAttribute('data-value', bodies[11].id)
    await expect(list).toHaveCount(0)
    expect(purchases()).toBe(0)
  } finally {
    await context.close()
  }
})

for (const mission of ['Attack', 'Espionage'] as const) {
  test(`mobile hostile fleet pulse follows incoming ${mission} across planets and clears on reconciliation`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const missions = {
      fleets: [],
      incoming: [] as import('../src/contracts').components['schemas']['IncomingMission4'][],
      score_value_micro: '0',
      fleet_slots: '1',
    }
    let revision = 1
    await shellFixture(page, { protocol: 4, missions, viewerRevision: () => String(revision) })
    const bar = page.getByRole('group', { name: 'Planet and resources' })
    const overlay = () => bar.evaluate(element => {
      const style = getComputedStyle(element, '::after')
      return { animation: style.animationName, duration: style.animationDuration, content: style.content, opacity: style.opacity }
    })
    const refresh = async () => {
      revision++
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
    }
    expect((await overlay()).content).toBe('none')
    missions.incoming.push({
      sender: id(9), origin: { galaxy: 1, system: 372, position: 3 },
      target: id(6), mission: 'Transport', arrival_at: Date.now() + 300000,
      ships: { visibility: 'Unknown' },
    })
    await refresh()
    expect((await overlay()).content).toBe('none')
    missions.incoming.push({ ...missions.incoming[0], mission })
    await refresh()
    await expect(bar.getByRole('status')).toHaveText('Incoming hostile fleet: attack or espionage detected.')
    await expect(bar).toHaveCSS('border-bottom', '1px solid rgb(113, 50, 59)')
    expect(await bar.evaluate(element => getComputedStyle(element, '::after').boxShadow)).toBe('none')
    for (const width of [320, 390, 767]) {
      await page.setViewportSize({ width, height: 844 })
      expect((await overlay()).animation).toContain('hostile-pulse')
      expect((await overlay()).duration).toBe('3.2s')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await selectBody(page, id(6))
    expect((await overlay()).animation).toContain('hostile-pulse')
    await page.getByRole('button', { name: 'Metal details', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Metal', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    expect((await overlay()).animation).toContain('hostile-pulse')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(overlay).toMatchObject({ animation: 'none', opacity: '0.7' })
    await page.setViewportSize({ width: 1024, height: 844 })
    expect((await overlay()).content).toBe('none')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Seek only after testing normal CSS lifecycle: manual playback takes ownership
    // of a CSS animation and can otherwise outlive changes to animation-name.
    const pulseOpacity = await bar.evaluate(element => {
      const animation = element.getAnimations({ subtree: true }).find(
        animation => animation instanceof CSSAnimation && animation.animationName.includes('hostile-pulse'),
      )!
      animation.pause()
      animation.currentTime = 0
      const low = Number(getComputedStyle(element, '::after').opacity)
      animation.currentTime = 1600
      const high = Number(getComputedStyle(element, '::after').opacity)
      animation.cancel()
      return { low, high }
    })
    expect(pulseOpacity).toEqual({ low: 0.3, high: 1 })
    missions.incoming.pop()
    await refresh()
    await expect(bar.getByRole('status')).toHaveText('')
    await expect(bar).toHaveCSS('border-bottom', '1px solid rgb(133, 115, 84)')
    expect((await overlay()).content).toBe('none')
  })
}

for (const width of [390, 1440]) {
  test(`Develop activity badges follow each planet and account-wide research at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let revision = 1
    const options: NonNullable<Parameters<typeof shellFixture>[1]> = {
      protocol: 4,
      bodies: [body, { ...body, id: id(6), coordinates: { galaxy: 1, system: 1, position: 8 } }],
      constructions: [], manufacturing: [], researchOperation: null,
      viewerRevision: () => String(revision),
    }
    await shellFixture(page, options)
    await navigate(page, 'Resources')
    const nav = page.getByRole('navigation', { name: 'Develop navigation' })
    const titles = ['Resources', 'Facilities', 'Research', 'Shipyard', 'Defense']
    const badges = async (working: string[]) => {
      for (const title of titles) {
        const tab = nav.getByRole('link', { name: title, exact: true })
        if (working.includes(title)) {
          await expect(tab).toHaveAttribute('aria-description', 'Work in progress')
          await expect(tab).toHaveAttribute('title', 'Work in progress')
          await expect(tab.locator('span[aria-hidden="true"]')).toBeVisible()
        } else {
          await expect(tab).not.toHaveAttribute('aria-description')
          await expect(tab.locator('span[aria-hidden="true"]')).toHaveCount(0)
        }
      }
    }
    await badges([])
    const now = Date.now()
    options.constructions = [
      { id: id(20), body: body.id, building: 'MetalMine', target_level: 2, paid: resources, due_at: now + 60000 },
      { id: id(21), body: id(6), building: 'ResearchLab', target_level: 1, paid: resources, due_at: now + 60000 },
    ]
    options.researchOperation = {
      id: id(22), host: id(6), research: 'EnergyTechnology', source_level: 1, target_level: 2,
      paid: resources, started_at: now, due_at: now + 60000, labs: [], effective_lab: '1', can_cancel: true,
    }
    const batch = { body: body.id, quantity: '2', completed_prefix: '0', remaining: '2', paid: resources,
      accepted_at: now, first_start_at: now, next_due_at: now + 30000, final_due_at: now + 60000, unit_duration_ms: 30000, can_cancel: false as const }
    options.manufacturing = [
      { ...batch, id: id(23), item: { kind: 'Ship', id: 'SmallCargo' }, state: 'Producing' },
      { ...batch, id: id(24), item: { kind: 'Defense', id: 'RocketLauncher' }, state: 'PaidQueued' },
    ]
    revision++
    await refreshGame(page)
    await badges(['Resources', 'Research', 'Shipyard', 'Defense'])
    await diagnosticScreenshot(nav, { path: `test-results/develop-activity-${width}.png` })
    await selectBody(page, id(6))
    await badges(['Facilities', 'Research'])
    options.constructions = []
    options.manufacturing = []
    options.researchOperation = null
    revision++
    await refreshGame(page)
    await badges([])
  })
}
