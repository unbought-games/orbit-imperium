import { test, expect } from './fixtures/test'
import { body, id, shellFixture } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const now = 1_800_000_000_000
const paid = { metal: '60000000', crystal: '15000000', deuterium: '0' }
const catalog: S['CatalogEntry3'][] = [
  { kind: 'Building', id: 'MetalMine' },
  { kind: 'Building', id: 'RoboticsFactory' },
  { kind: 'Research', id: 'EnergyTechnology' },
  { kind: 'Ship', id: 'SmallCargo' },
  { kind: 'Defense', id: 'RocketLauncher' },
].map((key) => ({
  key: key as S['CatalogKey3'],
  enabled: true,
  mobile: false,
  requirements: [],
  body_kinds: ['Planet'],
}))

function fixture(screen: string) {
  const building = screen === 'facilities' ? 'RoboticsFactory' : 'MetalMine'
  const planet = structuredClone(body)
  planet.levels[building] = 4
  const constructions: S['Construction3'][] = [
    {
      id: id(20),
      body: body.id,
      building,
      target_level: 5,
      paid,
      started_at: now - 60_000,
      due_at: now + 60_000,
    },
  ]
  const researchOperation: S['ResearchOperationDto'] = {
    id: id(21),
    host: body.id,
    research: 'EnergyTechnology',
    source_level: 4,
    target_level: 5,
    paid,
    started_at: now - 60_000,
    due_at: now + 60_000,
    labs: [],
    effective_lab: '1',
    can_cancel: true,
  }
  const manufacturing: S['ManufacturingBatchDto'][] = [
    {
      id: id(22),
      body: body.id,
      item:
        screen === 'defense'
          ? { kind: 'Defense', id: 'RocketLauncher' }
          : { kind: 'Ship', id: 'SmallCargo' },
      quantity: '4',
      completed_prefix: '0',
      remaining: '4',
      paid,
      accepted_at: now - 60_000,
      first_start_at: now - 60_000,
      next_due_at: now + 60_000,
      final_due_at: now + 420_000,
      unit_duration_ms: 120_000,
      state: 'Producing',
      can_cancel: false,
    },
  ]
  return {
    bodies: [planet],
    catalog,
    constructions,
    researchOperation,
    manufacturing,
    sampledAt: now,
    research: [{ research: 'EnergyTechnology' as const, level: 4 }],
  }
}

for (const width of [390, 1440]) {
  for (const screen of [
    'resources',
    'facilities',
    'research',
    'shipyard',
    'defense',
  ]) {
    test(`${screen} active work card and pulse at ${width}px`, async ({
      page,
    }) => {
      const height = width === 390 ? 844 : 1000
      await page.setViewportSize({ width, height })
      await page.clock.install({ time: now })
      await page.clock.pauseAt(now)
      let sampledAt = now
      await shellFixture(page, {
        ...fixture(screen),
        sampledAt: () => sampledAt,
      })
      await page.goto(`/u/andromeda/b/${body.id}/${screen}`)
      const manufacturing = screen === 'shipyard' || screen === 'defense'
      const summary = page.getByRole('region', {
        name: manufacturing
          ? 'Shipyard & defense'
          : screen === 'research'
            ? 'Research'
            : 'Buildings',
        exact: true,
      })
      const progress = summary.getByRole('progressbar')
      await expect(progress).toHaveAttribute('aria-valuenow', '50')
      await expect(progress).toHaveAttribute('data-moving', 'true')
      await expect(summary.locator('img').first()).toBeVisible()
      const artworkAlignment = await summary
        .locator('img')
        .first()
        .evaluate((image) => {
          const art = image.getBoundingClientRect()
          const frame = image.parentElement!.getBoundingClientRect()
          return {
            horizontalOffset:
              art.x + art.width / 2 - (frame.x + frame.width / 2),
            verticalOffset:
              art.y + art.height / 2 - (frame.y + frame.height / 2),
          }
        })
      expect(artworkAlignment).toEqual({
        horizontalOffset: 0,
        verticalOffset: 0,
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      const fill = progress.locator(':scope > span')
      expect(
        await fill.evaluate(
          (el) => getComputedStyle(el, '::after').animationName,
        ),
      ).not.toBe('none')
      if (!manufacturing) {
        await expect(
          summary.getByText('Level 5', { exact: true }),
        ).toBeVisible()
        await expect(
          summary.getByText('Time remaining', { exact: true }),
        ).toBeVisible()
        await expect(summary.getByRole('list')).toHaveCount(0)
        await expect(summary.getByText(/queue/i)).toHaveCount(0)
        const cancel = summary.getByRole('button', {
          name:
            screen === 'research' ? 'Cancel research' : 'Cancel construction',
          exact: true,
        })
        await expect(cancel).toBeEnabled()
        await cancel.click()
        const dialog = page.getByRole('dialog', {
          name: /Cancel (research|construction)\?/,
        })
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('refund')
        await page.keyboard.press('Escape')
        await expect(cancel).toBeFocused()
      }
      await summary
        .locator('img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await diagnosticScreenshot(page, {
        path: `test-results/active-${screen}-${width}x${height}.png`,
      })
      await diagnosticScreenshot(summary, {
        path: `test-results/aligned-${screen}-${width}x${height}.png`,
      })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(
        await fill.evaluate(
          (el) => getComputedStyle(el, '::after').animationName,
        ),
      ).toBe('none')
      expect(
        await fill.evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe('0s')
      sampledAt += 30_000
      await page.clock.fastForward(30_000)
      await expect(progress).toHaveAttribute('aria-valuenow', '75')
      sampledAt += 31_000
      await page.clock.fastForward(31_000)
      await expect(progress).toHaveAttribute('aria-valuenow', '100')
      await expect(progress).toHaveAttribute('data-moving', 'false')
      await expect(
        summary.getByText('Awaiting confirmation', { exact: true }).first(),
      ).toBeVisible()
      if (!manufacturing) {
        await expect(
          summary.getByText('Level 5', { exact: true }),
        ).toBeVisible()
        await diagnosticScreenshot(summary, {
          path: `test-results/active-${screen}-awaiting-${width}x${height}.png`,
        })
        await summary.getByRole('link', { name: /Level 5/ }).click()
        await expect(
          page.getByRole('region', { name: 'Progression quote', exact: true }),
        ).toBeVisible()
      }
    })
  }
}

test('construction without a server start time stays honest and demolition remains distinct', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const options = fixture('resources')
  delete options.constructions[0].started_at
  options.constructions[0].target_level = 3
  await shellFixture(page, options)
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const summary = page.getByRole('region', { name: 'Buildings', exact: true })
  await expect(summary.getByText('Tearing down', { exact: true })).toBeVisible()
  await expect(summary.getByText('Level 3', { exact: true })).toBeVisible()
  await expect(summary.getByRole('progressbar')).toHaveCount(0)
  await expect(
    summary.getByRole('button', { name: 'Cancel construction', exact: true }),
  ).toBeEnabled()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
