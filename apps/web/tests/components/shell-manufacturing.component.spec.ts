import { test, expect } from './fixture'
import { body, id, resources } from '../fixtures/game'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'
for (const width of [320, 390, 1440]) {
  test(`shipyard and defense show every batch and total completion at ${width}px`, async ({
    page,
    mount,
  }) => {
    const now = Date.now()
    await page.clock.install({ time: now - 1000 })
    await page.clock.pauseAt(now)
    const batch = {
      id: id(10),
      body: body.id,
      item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
      quantity: '3',
      completed_prefix: '1',
      remaining: '2',
      paid: resources,
      accepted_at: now,
      first_start_at: now - 75000,
      next_due_at: now + 25000,
      final_due_at: now + 75000,
      unit_duration_ms: 50000,
      state: 'Producing' as const,
      can_cancel: false as const,
    }
    await page.setViewportSize({ width, height: 900 })
    const options: EmpireSceneInput = {
      bodies: [body, { ...body, id: id(6), kind: 'Moon' }],
      constructions: [],
      researchOperation: null,
      screen: 'shipyard',
      sampledAt: now,
      manufacturing: [
        {
          ...batch,
          id: id(12),
          item: { kind: 'Ship', id: 'LightFighter' },
          state: 'PaidQueued',
          first_start_at: now + 175000,
          next_due_at: now + 225000,
          final_due_at: now + 275000,
        },
        batch,
        {
          ...batch,
          id: id(11),
          item: { kind: 'Defense', id: 'RocketLauncher' },
          state: 'PaidQueued',
          first_start_at: now + 75000,
          next_due_at: now + 125000,
          final_due_at: now + 175000,
        },
        {
          ...batch,
          id: id(13),
          body: id(6),
          final_due_at: now + 900000,
          item: { kind: 'Ship', id: 'LargeCargo' },
        },
      ],
    }
    await page.addInitScript((input) => {
      window.empireInput = input
    }, options)
    await mount('empire')
    const deliver = async () =>
      page.evaluate(async (input) => {
        const { view } = window.empireScene
        view.progression.manufacturing = input.manufacturing ?? []
        view.sampled_at = view.as_of_ms = input.sampledAt!
        await window.empireScene.refresh()
      }, options)
    for (const destination of ['shipyard']) {
      await deliver()
      const scope = page
      const queue = scope.getByRole('list', { name: 'Manufacturing queue' })
      await expect(
        queue.getByRole('heading', { name: 'Small Cargo' }),
      ).toBeVisible()
      await expect(queue).toContainText('Building now')
      await expect(queue.getByTitle('Units remaining')).toHaveText(
        '2 remaining',
      )
      await expect(queue).not.toContainText('remaining in this order')
      const upcoming = queue.getByRole('list', { name: 'Upcoming orders' })
      await expect(upcoming.getByRole('listitem')).toHaveCount(2)
      const firstOrder = upcoming.getByRole('button').nth(0)
      await expect(firstOrder).toHaveAccessibleName(
        'Rocket Launcher · 2 remaining details',
      )
      await expect(upcoming.getByRole('button').nth(1)).toHaveAccessibleName(
        'Light Fighter · 2 remaining details',
      )
      await expect(
        queue.getByRole('button', { name: /Large Cargo/ }),
      ).toHaveCount(0)
      await expect(queue.locator('dl').first()).toContainText('Next unit25s')
      await expect(queue.locator('dl').first()).toContainText(
        'This order1m 15s',
      )
      await expect(queue.locator('dl').first()).toContainText('Entire queue5m')
      await expect(queue.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '50',
      )
      await expect
        .poll(() =>
          queue
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
      await firstOrder.click()
      const details = page.getByRole('dialog', {
        name: 'Rocket Launcher · 2 remaining',
        exact: true,
      })
      await expect(details).toContainText('Starts in1m 15s')
      await expect(details).toContainText('Order complete2m 55s')
      await diagnosticScreenshot(page, {
        path: `test-results/queue-${destination}-details-${width}x900.png`,
      })
      await page.keyboard.press('Escape')
      await expect(details).toHaveCount(0)
      await firstOrder.focus()
      await page.keyboard.press('Enter')
      await expect(details).toBeVisible()
      await page.keyboard.press('Escape')
      await firstOrder.blur()
      await page.mouse.move(0, 0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
        await page.evaluate(() => document.fonts.ready)
      await diagnosticScreenshot(
        scope.getByRole('region', { name: 'Shipyard & defense', exact: true }),
        {
          path: `test-results/queue-${destination}-multiple-${width}x900.png`,
        },
      )
    }
    const captureState = async (state: string) => {
      if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
      // Tall narrow queues exceed a viewport; capture the document so sticky
      // navigation does not obscure the top of a scrolled locator capture.
      if (state === 'long-queue' && width === 320) {
        await page.evaluate(() =>
          window.scrollTo({ top: 0, behavior: 'instant' }),
        )
        await diagnosticScreenshot(page, {
          path: `test-results/queue-defense-${state}-${width}x900.png`,
          fullPage: true,
        })
        return
      }
      await diagnosticScreenshot(
        page.getByRole('region', { name: 'Shipyard & defense', exact: true }),
        { path: `test-results/queue-defense-${state}-${width}x900.png` },
      )
    }
    options.manufacturing = [
      batch,
      ...Array.from({ length: 12 }, (_, index) => ({
        ...batch,
        id: id(100 + index),
        item: {
          kind: 'Missile' as const,
          id: 'InterplanetaryMissile' as const,
        },
        quantity: index === 0 ? '9007199254740994' : '25',
        remaining: index === 0 ? '9007199254740994' : '25',
        completed_prefix: '0',
        state: 'PaidQueued' as const,
        first_start_at: now + 75000 + index * 1250000,
        next_due_at: now + 125000 + index * 1250000,
        final_due_at: now + 1325000 + index * 1250000,
      })),
    ]
    await deliver()
    await expect(
      page.getByRole('list', { name: 'Upcoming orders' }).getByRole('button'),
    ).toHaveCount(12)
    await expect(
      page.getByRole('button', {
        name: 'Interplanetary Missile · 9007199254740994 remaining details',
      }),
    ).toContainText('9,007,199,254,740,994')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await captureState('long-queue')
    options.manufacturing = [batch]
    // Regression: a lone order repeats the same completion time on every shared surface.
    for (const destination of ['shipyard']) {
      await deliver()
      const summary = page
        .getByRole('region', { name: 'Shipyard & defense', exact: true })
        .first()
      const timers = summary.locator('dl').first()
      await expect(timers.locator('dt')).toHaveText([
        'Next unit',
        'Until complete',
      ])
      await expect(timers).toContainText('Until complete1m 15s')
      await expect(summary.getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '50',
      )
      if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
        await summary
          .locator('img')
          .evaluateAll((images) =>
            Promise.all(
              images.map((image) => (image as HTMLImageElement).decode()),
            ),
          )
      await diagnosticScreenshot(summary, {
        path: `test-results/queue-${destination}-single-${width}x900.png`,
      })
    }
    await page.clock.fastForward(1000)
    await page.evaluate(() => window.empireScene.tick(1000))
    await expect(
      page
        .locator('dt')
        .filter({ hasText: /^Until complete$/ })
        .locator('..')
        .getByText('1m 14s', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '52',
    )
    options.sampledAt = now + 75000
    await deliver()
    await expect(
      page
        .locator('dt')
        .filter({ hasText: /^Until complete$/ })
        .locator('..')
        .getByText('Pending', { exact: true }),
    ).toBeVisible()
    await captureState('awaiting')
    options.manufacturing = []
    await deliver()
    await expect(
      page.getByText('No ships or defenses in production.'),
    ).toBeVisible()
    await expect(page.getByText('Until complete', { exact: true })).toHaveCount(
      0,
    )
    await captureState('empty')
  })
}
