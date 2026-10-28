import { test, expect, type Locator, type Page } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { binding, body, id, shellFixture } from './fixtures/game'
import type { components } from '../src/contracts'

type CatalogKey = components['schemas']['CatalogKey3']
const keys: CatalogKey[] = [
  { kind: 'Building', id: 'MetalMine' },
  { kind: 'Building', id: 'CrystalMine' },
  { kind: 'Building', id: 'DeuteriumSynthesizer' },
  { kind: 'Building', id: 'SolarPlant' },
  { kind: 'Building', id: 'RoboticsFactory' },
  { kind: 'Building', id: 'ResearchLab' },
  { kind: 'Research', id: 'EnergyTechnology' },
  { kind: 'Ship', id: 'SmallCargo' },
  { kind: 'Ship', id: 'LightFighter' },
  { kind: 'Defense', id: 'RocketLauncher' },
]
const catalog = keys.map((key) => ({
  key,
  requirements: [],
  enabled: true,
  mobile: key.kind === 'Ship',
  body_kinds: ['Planet' as const],
}))

const production: components['schemas']['ProductionDto'] = {
  body: body.id,
  settings: {
    metal_mine: 100,
    crystal_mine: 100,
    deuterium_synthesizer: 100,
    solar_plant: 100,
    fusion_reactor: 100,
    solar_satellite: 100,
  },
  settings_revision: '1',
  editable: [
    'metal_mine',
    'crystal_mine',
    'deuterium_synthesizer',
    'solar_plant',
  ],
  gross_per_hour: {
    metal: '63000000',
    crystal: '37000000',
    deuterium: '10000000',
  },
  fuel_deuterium_per_hour: '0',
  net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '10000000' },
  energy_supply: '48400000',
  energy_demand: '22000000',
  utilization: '1000000',
  fuel_utilization: '1000000',
}

async function selectionIs(target: Locator, disabled: boolean) {
  await expect(target).toBeVisible()
  if (disabled) await expect(target).toHaveCSS('-webkit-user-select', 'none')
  else await expect(target).not.toHaveCSS('-webkit-user-select', 'none')
}

async function galaxyFixture(page: Page) {
  await page.route('**/world', async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    const now = Date.now()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data: {
          galaxy,
          system,
          observed_at: now,
          positions: Array.from({ length: 15 }, (_, index) => ({
            coordinates: { galaxy, system, position: index + 1 },
            body:
              index === 0
                ? {
                    id: body.id,
                    kind: 'Planet',
                    owner: binding.player,
                    activity: { type: 'Recent' },
                    inactivity: 'Active',
                    vacation: false,
                    attack_blocker: null,
                    espionage_eligible: false,
                  }
                : null,
            debris: null,
          })),
        },
      },
    })
  })
}

async function capture(page: Page, name: string) {
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
  await page.evaluate(async () => {
    await document.fonts.ready
    const entrances = document
      .getAnimations()
      .filter(
        (animation) =>
          animation instanceof CSSAnimation &&
          /orbIn|dialogIn/.test(animation.animationName),
      )
    const images = [...document.images].filter((image) => {
      const box = image.getBoundingClientRect()
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.top < innerHeight &&
        box.bottom > 0
      )
    })
    await Promise.all([
      ...entrances.map((animation) =>
        animation.finished.catch(() => undefined),
      ),
      ...images.map((image) => image.decode().catch(() => undefined)),
    ])
  })
  const { width, height } = page.viewportSize()!
  await diagnosticScreenshot(page, {
    path: `test-results/touch-selection/${name}-${width}x${height}.png`,
    fullPage: false,
  })
}

const modes = [
  { name: 'mobile browser', touch: true, installed: false, width: 390 },
  { name: 'installed iOS', touch: true, installed: true, width: 390 },
  { name: 'landscape tablet', touch: true, installed: false, width: 1194 },
  { name: 'desktop', touch: false, installed: false, width: 1440 },
  { name: 'narrow desktop', touch: false, installed: false, width: 390 },
]
for (const mode of modes) {
  test.describe(mode.name, () => {
    test.use({
      hasTouch: mode.touch,
      isMobile: mode.touch,
      viewport: { width: mode.width, height: 900 },
    })

    test('controls suppress touch selection while content and desktop copying remain available', async ({
      page,
    }) => {
      if (mode.installed)
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'standalone', { value: true })
        })
      await shellFixture(page, {
        catalog,
        protocol: 4,
        production: [production],
      })
      expect(
        await page.evaluate(
          () => matchMedia('(hover: none) and (pointer: coarse)').matches,
        ),
      ).toBe(mode.touch)
      const nav = page.getByRole('navigation', {
        name: 'Main navigation',
        exact: true,
      })
      await selectionIs(
        nav.getByRole('link', { name: 'Develop', exact: true }),
        mode.touch,
      )
      if (mode.width >= 1024)
        await selectionIs(page.getByRole('banner'), mode.touch)
      await selectionIs(
        page.getByRole('link', {
          name: 'Energy — resource settings',
          exact: true,
        }),
        mode.touch,
      )
      // Ordinary coordinate links remain native copy targets, not control chrome.
      await selectionIs(
        page.getByRole('link', { name: /View .* in galaxy/ }).first(),
        false,
      )
      const metal = page.getByRole('button', {
        name: 'Metal details',
        exact: true,
      })
      if (mode.touch) await selectionIs(metal, true)
      await metal.click()
      const details = page.getByRole('dialog', { name: 'Metal', exact: true })
      await selectionIs(details.getByText('Available', { exact: false }), false)
      await page.keyboard.press('Escape')
      const worlds = page.getByRole('combobox', { name: 'Selected body' })
      if (mode.touch) await selectionIs(worlds, true)
      await worlds.click()
      const option = page.getByRole('option').first()
      if (mode.touch) await selectionIs(option, true)
      await option.click()
      await expect(page.getByRole('listbox')).toHaveCount(0)
      await nav.getByRole('link', { name: 'Develop', exact: true }).click()
      const tile = page.getByRole('link', {
        name: 'Upgrade Metal Mine',
        exact: true,
      })
      await selectionIs(tile, mode.touch)
      if (mode.touch) {
        const callout = await tile.evaluate((element) => ({
          supported: CSS.supports('-webkit-touch-callout', 'none'),
          value: getComputedStyle(element).getPropertyValue(
            '-webkit-touch-callout',
          ),
        }))
        if (callout.supported) expect(callout.value).toBe('none')
      }
      await expect(page.locator('main h1')).toHaveText('Resources')
      // Exercise a real route change after the policy is applied.
      await tile.click()
      await expect(page).toHaveURL(/resources\/metal-mine$/)
      await selectionIs(page.locator('figcaption p'), false)
      await selectionIs(page.getByRole('link', { name: /Back to/ }), mode.touch)
      await galaxyFixture(page)
      await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
      const slots = page.getByRole('button', { name: /Fleet slots:/ })
      if (mode.touch) await selectionIs(slots, true)
      await slots.click()
      await selectionIs(
        page.getByRole('tooltip').getByText(/Used slots out of/),
        false,
      )
      if (mode.width < 768) {
        const orb = page.getByRole('button', { name: /Open command HUD/ })
        if (mode.touch) await selectionIs(orb, true)
        await selectionIs(
          page.getByLabel('Fleet slots: 0 used of 1', { exact: true }),
          mode.touch,
        )
        await orb.click()
        const panel = page.getByRole('dialog', {
          name: 'Command uplink',
          exact: true,
        })
        await selectionIs(
          panel.getByRole('heading', { name: 'Command uplink', exact: true }),
          false,
        )
        await page
          .getByRole('button', { name: 'Close command HUD', exact: true })
          .click()
      }
    })
  })
}

for (const touch of [true, false]) {
  test.describe(
    touch
      ? 'touch editing and visual audit'
      : 'desktop editing and visual audit',
    () => {
      test.use({
        hasTouch: touch,
        isMobile: touch,
        reducedMotion: 'no-preference',
        viewport: { width: touch ? 390 : 1440, height: 900 },
      })

      test('mixed navigation content and public links retain native selection', async ({
        page,
      }) => {
        await shellFixture(page, { protocol: 4 })
        await page.route('**/rankings', (route) => {
          const context = route.request().postDataJSON()
          return route.fulfill({
            json: {
              binding,
              request_id: context.request_id,
              sampled_at: 1792843200000,
              processing_pending: false,
              players: [
                {
                  player: binding.player,
                  username: 'Copyable Commander',
                  points: '1000',
                  rank: 1,
                },
              ],
            },
          })
        })
        await page.goto(`/u/andromeda/high-scores?body=${body.id}`)
        const rankingPages = page.getByRole('navigation', {
          name: 'Ranking pages',
          exact: true,
        })
        const range = rankingPages.getByRole('status')
        await expect(range).toHaveText('1–1 of 1')
        await selectionIs(range, false)
        if (touch)
          await selectionIs(
            rankingPages.getByRole('button', { name: 'Next', exact: true }),
            true,
          )
        await capture(page, 'ranking-navigation')

        await page.route('**/alliances/query', (route) => {
          const { context } = route.request().postDataJSON()
          return route.fulfill({
            json: {
              ...context,
              sampled_at: 1792843200000,
              directory: [],
              directory_count: 0,
              alliance: null,
              applications: [],
            },
          })
        })
        await page.goto('/u/andromeda/alliance')
        const alliancePages = page.getByRole('navigation', {
          name: 'Alliance directory pages',
          exact: true,
        })
        await selectionIs(
          alliancePages.getByText('0 alliances', { exact: true }),
          false,
        )
        if (touch)
          await selectionIs(
            alliancePages.getByRole('button', {
              name: 'More alliances',
              exact: true,
            }),
            true,
          )
        await capture(page, 'alliance-navigation')

        await page.route('**/api/v1/bootstrap', (route) =>
          route.fulfill({
            json: {
              version: 1,
              signup_enabled: true,
              result: { status: 'anonymous' },
            },
          }),
        )
        await page.route('**/api/auth/config', (route) =>
          route.fulfill({ json: { mode: 'local', universes: [] } }),
        )
        await page.goto('/signup')
        const support = page
          .getByRole('navigation', {
            name: 'Policies and support',
            exact: true,
          })
          .getByRole('link', { name: 'Support', exact: true })
        await selectionIs(support, false)
        await expect(support).not.toHaveCSS('-webkit-touch-callout', 'none')
        await support.scrollIntoViewIfNeeded()
        await capture(page, 'public-policy')
      })

      test('game screens and popup content retain their intended selection behavior', async ({
        page,
      }) => {
        await shellFixture(page, {
          catalog,
          protocol: 4,
          production: [production],
          constructions: [
            {
              id: id(20),
              body: body.id,
              building: 'MetalMine',
              target_level: 2,
              paid: { metal: '0', crystal: '0', deuterium: '0' },
              due_at: Date.now() + 300000,
            },
          ],
        })
        await galaxyFixture(page)
        await capture(page, 'empire')
        await page
          .getByRole('button', { name: 'Metal details', exact: true })
          .click()
        await capture(page, 'resource-popup')
        await page.keyboard.press('Escape')
        await page.getByRole('combobox', { name: 'Selected body' }).click()
        await capture(page, 'planet-selector')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: 'Menu', exact: true }).click()
        await capture(page, 'navigation-menu')
        await page
          .getByRole('button', { name: 'Close menu', exact: true })
          .click()
        if (touch) {
          await page.getByRole('button', { name: /Open command HUD/ }).click()
          await expect(
            page.getByRole('dialog', { name: 'Command uplink', exact: true }),
          ).toBeVisible()
          await capture(page, 'command-hud')
          await page
            .getByRole('button', { name: 'Close command HUD', exact: true })
            .click()
        } else {
          await expect(
            page.getByRole('button', { name: /Open command HUD/ }),
          ).toHaveCount(0)
          await capture(page, 'command-hud')
        }
        for (const screen of [
          'resources',
          'facilities',
          'research',
          'shipyard',
          'defense',
          'fleets',
          'galaxy',
        ]) {
          await page.goto(`/u/andromeda/b/${body.id}/${screen}`)
          await expect(page.locator('main h1')).toHaveText(
            screen[0].toUpperCase() + screen.slice(1),
          )
          await expect(
            page.getByRole('navigation', {
              name: 'Main navigation',
              exact: true,
            }),
          ).toBeVisible()
          await capture(page, screen)
        }
        await page.goto('/detail-playground?scene=mine-ready')
        await selectionIs(page.locator('figcaption p'), false)
        await capture(page, 'building-detail')
        await page.goto('/detail-playground?scene=ship-ready')
        const quantity = page.locator('input[inputmode="numeric"]').first()
        await expect(quantity).toBeVisible()
        await selectionIs(quantity, false)
        if (touch)
          await expect(quantity).toHaveCSS('-webkit-user-select', 'text')
        await quantity.fill('12')
        await quantity.selectText()
        await page.keyboard.type('3')
        await expect(quantity).toHaveValue('3')
        await selectionIs(page.locator('figcaption p'), false)
        await capture(page, 'ship-detail')
        await page
          .getByRole('button', { name: 'Technology tree', exact: true })
          .click()
        const technology = page.getByRole('dialog', {
          name: 'Technology — Small Cargo',
          exact: true,
        })
        await expect(technology).toBeVisible()
        if (touch)
          await selectionIs(
            technology.getByRole('tab', { name: 'Techtree', exact: true }),
            true,
          )
        await capture(page, 'technology-tree')
        await page.goto('/action-sheet-playground')
        await page
          .getByRole('button', { name: 'Open snap sheet', exact: true })
          .click()
        const sheet = page.getByRole('dialog', {
          name: 'Planet actions',
          exact: true,
        })
        const notes = sheet.getByLabel('Notes', { exact: true })
        await notes.fill('Selectable notes')
        await selectionIs(notes, false)
        if (touch) await expect(notes).toHaveCSS('-webkit-user-select', 'text')
        await notes.selectText()
        await page.keyboard.type('Edited notes')
        await expect(notes).toHaveValue('Edited notes')
        await capture(page, 'action-sheet')
      })
    },
  )
}
