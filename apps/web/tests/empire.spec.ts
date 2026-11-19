import { empireFixture } from '../src/test-support/empire'
import { withBootstrapResponse, withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test } from './fixtures/test'
import {
  refuseFixtureReads,
  binding,
  body,
  id,
  shellFixture,
  installGameFixture,
  refreshGame,
} from './fixtures/game'
import type { components } from '../src/contracts'

type S = components['schemas']


for (const width of [1440, 390]) {
  test(`research directive opens its host planet and technology from the whole card at ${width}px`, { tag: width === 390 ? '@journey' : [] }, async ({ page }) => {
    refuseFixtureReads(page, { progression: ['Research'] })
    await page.setViewportSize({ width, height: 1000 })
    const now = Date.parse('2026-10-24T12:00:00Z')
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let revision = '1'
    const fixture = empireFixture(now)
    const options = {
      ...fixture,
      sampledAt: now,
      catalog: [{ key: { kind: 'Research' as const, id: 'ImpulseDrive' as const }, enabled: true, mobile: false, body_kinds: ['Planet' as const], requirements: [] }],
      viewerRevision: () => revision,
      researchOperation: {
        ...fixture.researchOperation,
        host: id(6),
        research: 'ImpulseDrive',
        started_at: now - 3 * 3_600_000,
        due_at: now + 5 * 3_600_000,
      } as S['ResearchOperationDto'] | null,
    }
    await shellFixture(page, options)
    const card = page.getByRole('region', { name: 'Empire research', exact: true })
    const research = card.getByRole('link', { name: /Impulse Drive/ })
    await expect(research).toHaveAttribute('href', `/u/andromeda/b/${id(6)}/research/impulse-drive`)
    await expect(research).toHaveAccessibleDescription('Host Planet [1:380:8]')
    await expect(research).toContainText('Level 5')
    await expect(research).toContainText('5 hours remaining')
    await expect(research.locator('img')).toHaveAttribute('src', '/art/atlas/objects/impulse-drive-96.webp')
    await expect.poll(() => research.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await expect(card.getByRole('progressbar')).toHaveAttribute('value', '37.5')
    // Inspect intermediate and smallest supported widths.
    for (const viewport of [320, 768, 1024, width]) {
      await page.setViewportSize({ width: viewport, height: 1000 })
      if (viewport >= 768) {
        const label = card.getByText('Empire-wide research', { exact: true })
        await expect(label).toBeVisible()
        expect(await label.evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1), `research label wraps at ${viewport}px`).toBe(true)
      }
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth), `card overflow at ${viewport}px`).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${viewport}px`).toBe(true)
      await diagnosticScreenshot(card, { path: `test-results/research-responsive-${width}-${viewport}x1000.png` })
    }
    await card.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/empire-research-active-${width}x1000.png` })
    await diagnosticScreenshot(card, { path: `test-results/research-active-${width}x1000.png` })
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(card.getByRole('link')).toHaveCount(1)
    // Clicking the heading and outer padding follows the same native link as the artwork.
    await card.click({ position: { x: 8, y: 8 } })
    const detailPath = `/u/andromeda/b/${id(6)}/research/impulse-drive`
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`))
    await expect(page.getByRole('region', { name: 'Active research', exact: true })).toContainText('Impulse Drive level 5')
    await expect(page.getByRole('button', { name: 'Cancel research', exact: true })).toBeVisible()
    await page.goBack()
    await research.focus()
    await expect(research).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`))
    await page.goBack()
    await card.click({ position: { x: (await card.boundingBox())!.width - 8, y: (await card.boundingBox())!.height - 8 } })
    await expect(page).toHaveURL(new RegExp(`${detailPath}$`))
    await page.goBack()
    options.researchOperation = null
    revision = '2'
    // Load a fresh authoritative idle snapshot after the navigation checks.
    await withFixtureResponse(page, response => response.url().endsWith('/api/v1/bootstrap'), () => page.reload())
    await expect(card).toContainText('No research in progress.')
    expect((await card.boundingBox())!.height).toBeLessThan(90)
    await expect(card.getByRole('progressbar')).toHaveCount(0)
    await expect(card.getByRole('button')).toHaveCount(0)
    await card.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(card, { path: `test-results/research-idle-${width}x1000.png` })
    await card.click({ position: { x: 8, y: 8 } })
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/research$`))
  })
}


test('empire shows every body, its own work and resources, and directional fleet traffic', { tag: '@journey' }, async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 1100 })
  const now = Date.parse('2026-10-24T12:00:00Z')
  await page.clock.install({ time: now })
  // Pin wall time before pausing so a delayed protocol round-trip cannot make
  // the target timestamp older than the running fake clock.
  await page.clock.setFixedTime(now)
  await page.clock.pauseAt(now)
  const options = empireFixture(now)
  const purchases = await shellFixture(page, { ...options, sampledAt: now })
  await expect(page).toHaveTitle('Empire · Andromeda · Orbit Imperium')
  await expect(page.getByRole('article')).toHaveCount(4)
  const planet = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  const colony = page.getByRole('article', {
    name: 'Planet [1:380:8] dossier',
    exact: true,
  })
  const moon = page.getByRole('article', {
    name: 'Moon [1:371:4] dossier',
    exact: true,
  })
  await expect(planet).toContainText('Metal Mine · Level 8')
  await expect(colony).toContainText('Robotics Factory · Level 7')
  await expect(colony).toContainText('15191 km · 24 to 64 °C')
  await expect(planet.getByRole('button', { name: '-60 to -20 °C', exact: true })).toBeVisible()
  await expect(colony.getByRole('button', { name: '24 to 64 °C', exact: true })).toBeVisible()
  await expect(moon.getByText(/Maximum temperature/)).toHaveCount(0)
  await expect(moon).not.toContainText('Metal Mine · Level 8')
  await expect(planet.getByLabel('Planet resources')).toContainText('25,216')
  await expect(planet).toContainText('1 in')
  await expect(planet).toContainText('2 out')
  await expect(colony).toContainText('2 in')
  await expect(moon).toContainText('0 in')
  const traffic = page.getByRole('region', {
    name: 'Fleet movements',
    exact: true,
  })
  await expect(traffic.getByRole('listitem')).toHaveCount(4)
  await expect(traffic).toContainText('1 incoming hostile fleet detected')
  await expect(traffic).toContainText('Ship composition unknown')
  await expect(
    page.getByRole('region', { name: 'Empire research' }).getByRole('link', { name: /Energy Technology/ }),
  ).toHaveAccessibleDescription('Host Planet [1:371:4]')
  await expect(colony).not.toContainText('Energy Technology')
  await page.getByText('Empire orbital network', { exact: true }).click()
  await page
    .getByRole('link', { name: 'Focus Planet [1:380:8]', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/overview$`))
  await expect(colony).toContainText('Command focus')
  await expect(page.getByRole('article')).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Dispatch fleet' })).toHaveCount(0)
  expect(purchases()).toBe(0)
})


test('one quiet planet, unavailable fleets and missing art remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/art/**', (route) => route.abort())
  await shellFixture(page, { bodies: [body], protocol: 3 })
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByText('The lanes are quiet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dispatch fleet' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('link', { name: 'Manage Planet [1:371:12]' }),
  ).toBeVisible()
  await expect(page.getByText('No research in progress.')).toBeVisible()
})


for (const width of [390]) {
  test(`current carried resources appear in owned fleet summaries at ${width}px`, { tag: '@journey' }, async ({ page }) => {
    const now = new Date('2026-10-24T12:00:00Z')
    await page.clock.install({ time: now })
    await page.setViewportSize({ width, height: 1000 })
    const options = empireFixture(now.getTime())
    const base = options.missions.fleets[0]
    const cases = [
      { mission: 'Transport', leg: 'Outbound', cargo: { metal: '1250000000', crystal: '2000000', deuterium: '3500000' } },
      { mission: 'Deploy', leg: 'Outbound', cargo: { metal: '4000000', crystal: '5000000', deuterium: '6000000' } },
      { mission: 'Attack', leg: 'Returning', cargo: { metal: '9223372036854775807', crystal: '8000000', deuterium: '9000000' } },
      { mission: 'Transport', leg: 'Returning', cargo: { metal: '11000000', crystal: '12000000', deuterium: '13000000' } },
      { mission: 'Deploy', leg: 'Returning', cargo: { metal: '0', crystal: '0', deuterium: '0' } },
    ] as const
    options.missions.fleets = cases.map(({ mission, leg, cargo }, index) => ({
      ...base,
      id: id(300 + index),
      intent: { ...base.intent, mission, cargo: { metal: '999000000', crystal: '999000000', deuterium: '999000000' } },
      leg,
      cargo,
      can_recall: leg === 'Outbound',
    }))
    await shellFixture(page, { ...options, sampledAt: now.getTime() })
    const board = page.getByRole('region', { name: 'Fleet movements', exact: true })
    await expect(board.getByRole('group', { name: 'Carried resources' })).toHaveCount(5)
    const incoming = board.getByRole('listitem').filter({ hasText: 'Incoming' })
    await expect(incoming.getByRole('group', { name: 'Carried resources' })).toHaveCount(0)
    const verifyCargo = async (container: import('@playwright/test').Locator, index: number) => {
      const cargo = container.getByRole('group', { name: 'Carried resources' })
      await expect(cargo).toHaveCount(1)
      for (const [resource, value] of Object.entries(cases[index].cargo)) {
        const title = resource[0].toUpperCase() + resource.slice(1)
        const quantity = cargo.locator(`[title="${title}"]`)
        await expect(quantity.getByRole('img', { name: title })).toBeVisible()
        await expect(quantity).toHaveText((BigInt(value) / 1000000n).toLocaleString('en-US'))
      }
      await expect(cargo).not.toContainText('999')
      expect(await container.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
    for (const [index, entry] of cases.entries()) {
      const row = board.getByRole('listitem').filter({ has: page.getByRole('link', {
        name: `View ${entry.mission} ${entry.leg.toLowerCase()} fleet`, exact: true,
      }) })
      await verifyCargo(row, index)
    }
    await diagnosticScreenshot(board, { path: `test-results/cargo-empire-${width}.png` })
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/fleets`))
    const cards = page.getByRole('article').filter({ has: page.getByRole('group', { name: 'Carried resources' }) })
    await expect(cards).toHaveCount(5)
    for (let index = 0; index < cases.length; index++) await verifyCargo(cards.nth(index), index)
    await expect(page.getByRole('article', { name: /^Incoming .* fleet$/ }).getByRole('group', { name: 'Carried resources' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(cards.nth(2), { path: `test-results/cargo-returning-attack-${width}.png` })
    await cards.nth(2).getByRole('link', { name: /^View .* fleet$/ }).click()
    await verifyCargo(page.getByRole('article', { name: 'Attack fleet', exact: true }), 2)
  })
}


for (const member of [true, false]) {
  test(`alliance panel waits for confirmed membership before offering discovery (${member ? 'member' : 'nonmember'})`, async ({ page }) => {
    await installGameFixture(page, { protocol: 4, bodies: [body], missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' } })
    let release!: () => void
    const profilesReady = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/player-profiles', async route => {
      await profilesReady
      const { context } = route.request().postDataJSON()
      const now = Math.floor(Date.now() / 1000)
      await route.fulfill({ json: {
        ...context,
        players: [{ player: binding.player, username: 'Commander', observed_at: now, expires_at: now + 300,
          ...(member ? { alliance: { id: id(800), universe: binding.universe, name: 'Starlight Assembly', tag: 'STAR' } } : {}),
        } satisfies S['PlayerDisplay']],
      } })
    })
    const requested = page.waitForRequest(request => request.url().endsWith('/player-profiles'))
    await withFixtureResponse(page, response => response.url().endsWith('/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
    await requested
    const panel = page.getByRole('region', { name: 'Empire alliance', exact: true })
    await expect(panel.getByRole('link', { name: 'Open alliance', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/alliance`)
    await withFixtureResponse(page, response => response.url().endsWith('/player-profiles'), async () => { release() })
    await expect(panel.getByRole('link', { name: member ? 'Your alliance' : 'Find your alliance', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/alliance${member ? '' : '/discover'}`)
  })
}

test('desktop and phone command views keep all information readable without horizontal scrolling', async ({
  page,
}) => {
  const options = empireFixture()
  await shellFixture(page, options)
  for (const width of [1672, 1024, 768, 430, 390, 320]) {
    await page.setViewportSize({ width, height: width > 767 ? 1100 : 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page.locator('main img').evaluateAll(async (images) => {
        // Screenshot preparation also loads art inside the collapsed map.
        await Promise.all(images.map((image) => {
          const img = image as HTMLImageElement
          img.loading = 'eager'
          return img.decode().catch(() => {})
        }))
      })
    }

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const disclosure = page.locator('summary').filter({ hasText: 'Empire orbital network' })
    if (width <= 767) await expect(disclosure).toBeHidden()
    else await expect(disclosure).toBeVisible()
    const bodies = page.getByRole('article')
    await expect(bodies).toHaveCount(4)
    for (const [index, dossier] of (await bodies.all()).entries()) {
      await expect(dossier.getByLabel(`${options.bodies[index].kind} resources`, { exact: true })).toBeVisible()
      expect(
        await dossier.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
    await diagnosticScreenshot(page, { path: `test-results/empire-viewport-${width}.png` })
    await diagnosticScreenshot(page, {
      path: `test-results/empire-${width}.png`,
      fullPage: true,
    })
  }
  const planet = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  await planet.locator('summary').filter({ hasText: 'Fleet traffic' }).focus()
  await page.keyboard.press('Enter')
  await expect(planet).toContainText('Ship composition unknown')
  await planet
    .locator('summary')
    .filter({ hasText: 'Orbital fleet' })
    .click()
  await expect(
    planet.getByRole('region', { name: 'Orbital fleet' }),
  ).toContainText('Small Cargo2')
  const ships = planet.getByRole('region', { name: 'Orbital fleet', exact: true })
  await expect(ships).toContainText('Solar Satellite4')
  await expect(ships).not.toContainText('Rocket Launcher')
  await expect(ships).not.toContainText('Light Laser')
  await expect(planet.locator('summary').filter({ hasText: 'Orbital fleet' })).toHaveText('Orbital fleet6 ships')
  await planet.locator('summary').filter({ hasText: 'Planetary defenses' }).click()
  const defenses = planet.getByRole('region', { name: 'Planetary defenses', exact: true })
  await expect(defenses).toContainText('Rocket Launcher3')
  await expect(defenses).toContainText('Light Laser2')
  await expect(defenses).not.toContainText('Small Cargo')
  await planet.getByRole('button', { name: '-60 to -20 °C', exact: true }).click()
  await expect(page.getByRole('tooltip')).toContainText('Maximum temperature affects deuterium production and solar satellite energy output.')
  await expect(page.getByRole('tooltip')).toContainText('Each solar satellite produces 20 at 100% production.')
  await expect(page.getByRole('article', { name: 'Planet [1:402:2] dossier', exact: true }).getByRole('button', { name: 'Temperature unavailable', exact: true })).toBeVisible()
  await diagnosticScreenshot(page, { path: 'test-results/empire-details-mobile.png', fullPage: true })
  options.bodies.push({
    ...body,
    id: id(9),
    coordinates: { galaxy: 1, system: 411, position: 15 },
  })
  await refreshGame(page)
  await expect(page.getByRole('article')).toHaveCount(5)
})

for (const longContent of [false, true]) {
  test(`fleet movements stay visible and fit the page with ${longContent ? 'long names and manifests' : 'a single outbound flight'}`, async ({
    page,
  }) => {
    const now = new Date('2026-10-23T12:00:00Z')
    await page.clock.install({ time: now })
    const options = empireFixture(now.getTime())
    if (longContent) {
      options.bodies = options.bodies.map((planet) => ({
        ...planet,
        ...(planet.kind === 'Planet' ? { name: 'W'.repeat(40) } : {}),
      }))
      for (const fleet of options.missions.fleets) {
        fleet.ships = [
          { ship_type: 'LightFighter', count: '9223372036854775807' },
          { ship_type: 'SmallCargo', count: '9223372036854775807' },
        ]
        fleet.destination = { galaxy: 1, system: 499, position: 15 }
      }
    } else {
      options.missions.fleets = [options.missions.fleets[0]]
      options.missions.incoming = []
    }
    await shellFixture(page, { ...options, sampledAt: now.getTime() })
    const board = page.getByRole('region', {
      name: 'Fleet movements',
      exact: true,
    })
    const list = board.getByRole('list').first()
    const scrollArea = list.locator('..')
    for (const width of [1778, 1024, 768, 430, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(list).toBeVisible()
      expect(
        await scrollArea.evaluate((el) => el.scrollWidth - el.clientWidth),
        `horizontal overflow at ${width}px`,
      ).toBe(0)
      for (const row of await list.getByRole('listitem').all()) {
        expect(
          await row.evaluate((el) => el.scrollWidth - el.clientWidth),
        ).toBe(0)
        const action = row.getByRole('link', { name: /^View .* fleet$/ }).or(
          row.getByRole('button', { name: /^Incoming .* ship composition:/ }),
        )
        await expect(action).toBeVisible()
        await action.focus()
        await expect(action).toBeInViewport()
        expect(
          await action.evaluate((el) => {
            const bounds = el.getBoundingClientRect()
            const row = el.closest('li')!.getBoundingClientRect()
            return (
              bounds.left >= row.left &&
              bounds.right <= row.right &&
              bounds.width >= 44
            )
          }),
        ).toBe(true)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await scrollArea.evaluate((el) => {
        el.scrollTop = 0
      })
      await diagnosticScreenshot(board, {
        path: `test-results/fleet-movements-${longContent ? 'long' : 'single'}-${width}.png`,
      })
    }
    if (longContent) {
      await expect(list).toContainText('W'.repeat(40))
      const owned = list.getByRole('listitem', { name: 'Transport fleet', exact: true }).first()
      const manifest = owned.getByRole('button', { name: 'Transport ship composition: 18,446,744,073,709,551,614 ships', exact: true })
      await manifest.click()
      await expect(owned.getByRole('list', { name: 'Ship composition' }).getByRole('listitem')).toHaveText([
        'Light Fighter 9,223,372,036,854,775,807', 'Small Cargo 9,223,372,036,854,775,807',
      ])
      await manifest.click()
      await expect(list).toContainText('[1:499:15]')
    }
    await list
      .getByRole('link', { name: /^View .* fleet$/ })
      .last()
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/fleets/${longContent ? id(32) : id(30)}$`),
    )
  })
}
