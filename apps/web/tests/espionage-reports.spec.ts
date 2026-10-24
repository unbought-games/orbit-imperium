import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import { shellFixture, binding, body, id } from './fixtures/game'

for (const variant of ['legacy', 'expanded', 'hidden'] as const) {
  test(`groups ${variant} espionage buildings at desktop and mobile widths`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'))
    await shellFixture(page, {
      protocol: 4,
      extraCapabilities: ['Reports', 'Attack'],
    })
    const header = {
      id: id(63),
      kind: 'Espionage',
      observed_at: Date.now() - 60_000,
      read: true,
      hidden: false,
    }
    const payload = {
      ...observation,
      target: { ...observation.target, name: variant === 'legacy' ? undefined : 'Nova Roma' },
      resources: { visibility: 'Known', value: { metal: '18763000000', crystal: '10441000000', deuterium: '560000000' } },
      buildings:
        variant === 'hidden'
          ? { visibility: 'Unknown' }
          : {
              visibility: 'Known',
              value: {
                ...observation.buildings.value,
                MetalMine: 7,
                CrystalMine: 6,
                SolarPlant: 9,
                ResearchLab: 2,
                ...(variant === 'expanded'
                  ? {
                      FusionReactor: 3,
                      NaniteFactory: 1,
                      LunarBase: 0,
                      SensorPhalanx: 0,
                      JumpGate: 0,
                    }
                  : {}),
              },
            },
    }
    await page.route('**/api/**/reports**', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: (request.context ?? request).request_id,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: { header, payload, player_names: { [observation.target.owner]: 'Commander Vega' } },
        },
      })
    })
    await page.goto(`/u/andromeda/reports/${header.id}?body=${body.id}`)
    const report = page.getByRole('region', { name: 'Report observation' })
    const buildings = report.locator('section').filter({
      has: page.getByRole('heading', { name: 'Buildings', exact: true }),
    })
    await expect(buildings).toBeVisible()
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      const back = (await page.getByRole('link', { name: 'Back to reports' }).boundingBox())!
      const title = (await page.getByRole('heading', { name: 'Espionage', exact: true }).boundingBox())!
      const remove = (await page.getByRole('button', { name: 'Delete report', exact: true }).boundingBox())!
      const timestamp = (await page.getByRole('button', { name: 'Report time details' }).boundingBox())!
      expect(title.x).toBeGreaterThan(back.x + back.width)
      expect(title.y).toBeLessThan(back.y + back.height)
      expect(timestamp.x).toBe(title.x)
      expect(timestamp.y - title.y - title.height).toBeGreaterThanOrEqual(0)
      expect(timestamp.y - title.y - title.height).toBeLessThanOrEqual(2)
      expect(timestamp.height).toBeLessThanOrEqual(24)
      const reportTop = (await report.boundingBox())!.y
      expect(reportTop - Math.max(timestamp.y + timestamp.height, back.y + back.height)).toBeLessThanOrEqual(8)
      expect(remove.x).toBeGreaterThan(title.x + title.width)
      const target = page.getByLabel('Espionage target', { exact: true })
      await expect(target.getByRole('heading', { name: 'Target', exact: true })).toBeVisible()
      await expect(target).toHaveCSS('border-bottom-width', '1px')
      expect((await target.boundingBox())!.height).toBeLessThanOrEqual(76)
      const player = (await target.getByText('Commander Vega', { exact: true }).boundingBox())!
      const location = target.getByRole('link', { name: /View target/ })
      const locationBox = (await location.boundingBox())!
      expect(locationBox.y - player.y - player.height).toBeLessThanOrEqual(5)
      expect(locationBox.height).toBeLessThanOrEqual(20)
      await expect(target).toContainText('Commander Vega')
      await expect(target).toContainText(variant === 'legacy' ? 'Planet' : 'Nova Roma')
      await expect(target.locator('img')).toBeVisible()
      const attack = target.getByRole('button', { name: 'Attack', exact: true })
      await expect(attack).toBeVisible()
      expect((await attack.boundingBox())!.x).toBeGreaterThan((await target.locator('img').boundingBox())!.x + 36)
      const amounts = report.getByRole('group', { name: 'Resource amounts' })
      const icons = amounts.locator('svg')
      await expect(icons).toHaveCount(3)
      const firstY = (await icons.first().boundingBox())!.y
      for (const [index, resource] of ['metal', 'crystal', 'deuterium'].entries()) {
        const icon = icons.nth(index)
        expect((await icon.boundingBox())!.y).toBe(firstY)
        await expect(icon).toHaveAccessibleName(resource[0].toUpperCase() + resource.slice(1))
        const color = await page.evaluate(resource => {
          const probe = document.createElement('span')
          probe.style.color = `var(--resource-${resource})`
          document.body.append(probe)
          const color = getComputedStyle(probe).color
          probe.remove()
          return color
        }, resource)
        await expect(icon).toHaveCSS('color', color)
      }
      expect(await amounts.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
      await expect(amounts).toContainText('18,763')
      const research = report.locator('section').filter({ has: page.getByRole('heading', { name: 'Research', exact: true }) })
      expect((await report.locator('footer').boundingBox())!.y).toBeGreaterThanOrEqual((await research.boundingBox())!.y + (await research.boundingBox())!.height)
      await expect(report.locator('footer')).toContainText('Activity before contact')
      await expect(report.locator('footer')).toContainText('Counterespionage')
      if (variant === 'expanded' && width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await diagnosticScreenshot(page, { path: 'test-results/espionage-layout-390.png' })
      }
      if (variant === 'hidden') {
        await expect(buildings).toContainText(
          'Unknown — this observation did not reveal this section.',
        )
        await expect(buildings.locator('h4, dt')).toHaveCount(0)
      } else {
        await expect(buildings.locator('h4')).toHaveText([
          'Resource buildings',
          'Facility buildings',
        ])
        const resources = buildings.locator('dl').nth(0)
        const facilities = buildings.locator('dl').nth(1)
        await expect(resources.locator('dt')).toHaveText([
          'Metal Mine',
          'Crystal Mine',
          'Deuterium Synthesizer',
          'Solar Plant',
          ...(variant === 'expanded' ? ['Fusion Reactor'] : []),
          'Metal Storage',
          'Crystal Storage',
          'Deuterium Tank',
        ])
        await expect(resources.locator('dd')).toHaveText([
          'Level 7',
          'Level 6',
          'Level 0',
          'Level 9',
          ...(variant === 'expanded' ? ['Level 3'] : []),
          'Level 0',
          'Level 0',
          'Level 0',
        ])
        await expect(facilities.locator('dt')).toHaveText([
          'Robotics Factory',
          'Shipyard',
          'Research Lab',
          ...(variant === 'expanded'
            ? ['Nanite Factory', 'Lunar Base', 'Sensor Phalanx', 'Jump Gate']
            : []),
        ])
        await expect(facilities.locator('dd')).toHaveText([
          'Level 0',
          'Level 0',
          'Level 2',
          ...(variant === 'expanded'
            ? ['Level 1', 'Level 0', 'Level 0', 'Level 0']
            : []),
        ])
        const resourceBounds = await resources.boundingBox()
        const facilityBounds = await facilities.boundingBox()
        expect(resourceBounds!.y + resourceBounds!.height).toBeLessThan(
          facilityBounds!.y,
        )
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.evaluate(() => document.fonts.ready)
      await diagnosticScreenshot(buildings, {
        path: `test-results/espionage-${variant}-${width}.png`,
      })
    }
  })
}
