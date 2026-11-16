import { test, expect } from './fixture'
import { activeWorkFixture as fixture } from '../../src/test-support/active-work'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type {} from './empire.scenarios'

const now = 1_800_000_000_000
for (const width of [390, 1440]) {
  for (const screen of ['resources', 'research', 'shipyard']) {
    test(`${screen} active work card and pulse at ${width}px`, async ({
      page,
      mount,
    }) => {
      const height = width === 390 ? 844 : 1000
      await page.setViewportSize({ width, height })
      await page.clock.install({ time: now })
      await page.clock.pauseAt(now)
      await page.addInitScript(
        (input) => {
          window.empireInput = input
        },
        { ...fixture(screen), screen: screen as 'resources' },
      )
      await mount('empire')
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
        expect(
          await cancel.evaluate(
            (button) =>
              button.closest(':has(> div > [role="progressbar"])') !== null,
          ),
        ).toBe(true)
        await cancel.click()
        const dialog = page.getByRole('dialog', {
          name: /Cancel (research|construction)\?/,
        })
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText('refund')
        const refund = dialog.getByRole('group', {
          name: 'Cancellation refund',
        })
        await expect(refund.getByRole('img', { name: 'Metal' })).toBeVisible()
        await expect(
          refund.getByRole('img', { name: 'Deuterium' }),
        ).toHaveCount(0)
        const [keep, confirm] = await Promise.all(
          ['Keep working', 'Yes, cancel'].map(
            async (name) =>
              (await dialog
                .getByRole('button', { name, exact: true })
                .boundingBox())!,
          ),
        )
        expect(keep.y).toBe(confirm.y)
        expect(keep.x + keep.width).toBeLessThan(confirm.x)
        await page.keyboard.press('Escape')
        await expect(cancel).toBeFocused()
      }
      if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
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
      }
      await page.emulateMedia({ reducedMotion: 'reduce' })
      expect(
        await fill.evaluate(
          (el) => getComputedStyle(el, '::after').animationName,
        ),
      ).toBe('none')
      expect(
        await fill.evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toBe('0s')
      await page.clock.fastForward(30_000)
      await page.evaluate(() => window.empireScene.tick(30_000))
      await expect(progress).toHaveAttribute('aria-valuenow', '75')
      await page.clock.fastForward(31_000)
      await page.evaluate(() => window.empireScene.tick(61_000))
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
        await expect(page.getByLabel('Scene destination')).toHaveText(
          new RegExp(`/${screen}/`),
        )
      }
    })
  }
}

test('construction without a server start time stays honest and demolition remains distinct', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const options = fixture('resources')
  delete options.constructions[0].started_at
  options.constructions[0].target_level = 3
  await page.addInitScript(
    (input) => {
      window.empireInput = input
    },
    { ...options, screen: 'resources' as const },
  )
  await mount('empire')
  const summary = page.getByRole('region', { name: 'Buildings', exact: true })
  await expect(summary.getByText('Tearing down', { exact: true })).toBeVisible()
  await expect(summary.getByText('Level 3', { exact: true })).toBeVisible()
  await expect(summary.getByRole('progressbar')).toHaveCount(0)
  const cancel = summary.getByRole('button', {
    name: 'Cancel construction',
    exact: true,
  })
  await expect(cancel).toBeEnabled()
  const [cancelBox, summaryBox] = await Promise.all([
    cancel.boundingBox(),
    summary.boundingBox(),
  ])
  expect(cancelBox!.x + cancelBox!.width / 2).toBeGreaterThan(
    summaryBox!.x + summaryBox!.width * 0.75,
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
