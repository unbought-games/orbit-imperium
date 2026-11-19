import { test, expect } from './fixtures/test'
import { refuseFixtureReads, shellFixture, body } from './fixtures/game'
import { activeWorkFixture } from '../src/test-support/active-work'
import { withBootstrapResponse } from './fixtures/responses'

// Owns the application's summary-to-catalog link after the projected deadline.
// Layout, cancellation focus, labels and timing permutations live below bootstrap.
test('resources active work card and pulse at 390px', { tag: '@journey' }, async ({ page }) => {
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  const now = 1_800_000_000_000
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  let sampledAt = now
  await shellFixture(page, { ...activeWorkFixture('resources'), sampledAt: () => sampledAt })
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/resources`))
  const summary = page.getByRole('region', { name: 'Buildings', exact: true })
  await expect(summary.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
  sampledAt += 61_000
  await page.clock.fastForward(61_000)
  await expect(summary.getByText('Awaiting confirmation', { exact: true }).first()).toBeVisible()
  await summary.getByRole('link', { name: /Level 5/ }).click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/resources/metal-mine$`))
  await expect(page.getByRole('region', { name: 'Progression quote', exact: true })).toBeVisible()
})
