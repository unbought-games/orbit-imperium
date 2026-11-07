import { expect, test } from './fixtures/test'
import { installGameFixture, body } from './fixtures/game'

const now = Date.parse('2026-11-07T15:00:00Z')
const output =
  process.env.ORBIT_POC_OUTPUT ?? 'test-results/release-announcement'

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`curated release opens from the orb once ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(now)
    await installGameFixture(page, {
      protocol: 4,
      sampledAt: now,
      missions: {
        fleets: [],
        incoming: [],
        fleet_slots: '8',
        score_value_micro: '0',
      },
    })
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    const bubble = page.getByTestId('release-announcement')
    await expect(bubble).toBeVisible()
    await expect(bubble.getByRole('heading')).toHaveText(
      'The Intergalactic Research Network is here',
    )
    await expect(bubble.getByRole('listitem')).toHaveCount(3)
    await expect(bubble.locator('img')).toHaveJSProperty('complete', true)
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${output}/open-${width}x${height}.png` })
    await bubble.getByRole('button', { name: 'Got it' }).click()
    await expect(bubble).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('command-orb')).toBeVisible()
    await page.waitForTimeout(800)
    await expect(page.getByTestId('release-announcement')).toHaveCount(0)
    await page.screenshot({
      path: `${output}/acknowledged-${width}x${height}.png`,
    })
  })
}
