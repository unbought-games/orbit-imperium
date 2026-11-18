import { focusPlayerDetails } from './fixtures/profile-navigation'
import { test, expect } from './fixtures/test'
import {
  installGameFixture,
  playerProfilesFixture,
  binding,
  body,
  id,
} from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'

// Keep one mounted-consumer refresh journey; source permutations live in controller tests.
for (const width of [390]) {
  test(`bot profile labels follow authoritative refresh at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await installGameFixture(page, {
      protocol: 4,
      missions: { fleets: [], incoming: [], fleet_slots: '1', score_value_micro: '0' },
    })
    let kind: 'bot' | 'human' = 'bot'
    await playerProfilesFixture(page, () => [
      { player: id(31), username: 'Harvester', kind },
      { player: binding.player, username: 'Commander', kind: 'human' },
    ])
    await page.route('**/rankings', route => route.fulfill({ json: {
      binding, request_id: route.request().postDataJSON().request_id,
      sampled_at: Date.now(), processing_pending: false,
      players: [{ player: id(31), username: 'Harvester', points: '12500', rank: 1 }],
    } }))
    // Wait for this screen's identity data, not HTML load or unrelated HUD profiles.
    const withProfiles = (action: () => Promise<unknown>) =>
      withFixtureResponse(page, response => {
        if (!response.url().endsWith('/player-profiles')) return false
        const source = response.request().postDataJSON()?.source
        return source?.type === 'Rankings' && source.players.includes(id(31))
      }, action)
    await withProfiles(() => page.goto(`/u/andromeda/b/${body.id}/high-scores`))
    const trigger = page.getByRole('link', { name: 'Harvester profile details' })
    const profile = page.getByRole('tooltip', { name: 'Harvester profile' })
    await expect(trigger.getByLabel('Bot', { exact: true })).toBeVisible()
    await focusPlayerDetails(page, trigger)
    await expect(profile).toBeVisible()
    await expect(profile).toContainText('Automated player')
    await page.keyboard.press('Escape')
    await expect(profile).toHaveCount(0)

    kind = 'human'
    await withProfiles(() => page.evaluate(() => window.dispatchEvent(new Event('pageshow'))))
    await expect(trigger.getByLabel('Bot', { exact: true })).toHaveCount(0)
    await expect(trigger).toContainText('Harvester')
    await focusPlayerDetails(page, trigger)
    await expect(profile).toBeVisible()
    await expect(profile).toContainText('Commander')
    await expect(profile).not.toContainText(/automated|\bBot\b/i)
    await page.keyboard.press('Escape')
    await expect(profile).toHaveCount(0)
  })
}
