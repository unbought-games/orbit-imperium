import { test, expect } from '@playwright/test'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import { shellFixture, binding, body, id } from './fixtures/game'

for (const variant of ['legacy', 'expanded', 'hidden'] as const) {
  test(`groups ${variant} espionage buildings at desktop and mobile widths`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'))
    await shellFixture(page, {
      protocol: 4,
      extraCapabilities: ['Reports'],
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
          data: { header, payload },
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
      await buildings.screenshot({
        path: `test-results/espionage-${variant}-${width}.png`,
      })
    }
  })
}
