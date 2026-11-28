import { expect, test } from './fixture'
import { id, now } from './dispatch-data'
import { focusPlayerDetails } from '../fixtures/profile-navigation'
import type {} from './galaxy-screen.scenario'

for (const width of [1440, 390]) {
  test.describe(width === 390 ? 'phone' : 'desktop', () => {
    test.use({ hasTouch: width === 390, viewport: { width, height: 1000 } })
    test('Galaxy keeps activity separate from identity and restores keyboard focus around the dossier', async ({
      page,
      mount,
    }) => {
      await page.clock.setFixedTime(now)
      const peer = id(31),
        self = id(2),
        stamp = Math.floor(now / 1000)
      const alliance = {
        id: id(90),
        universe: id(3),
        name: 'The Astral Accord',
        tag: 'ASTRA',
      }
      await page.addInitScript(
        (input) => {
          window.galaxyInput = input
        },
        {
          positions: {
            1: {
              body: {
                id: peer,
                kind: 'Planet' as const,
                owner: peer,
                name: 'Vesper',
                activity: { type: 'Recent' as const },
                inactivity: 'Active' as const,
                vacation: false,
                espionage_eligible: true,
              },
            },
            2: {
              body: {
                id: id(5),
                kind: 'Planet' as const,
                owner: self,
                name: 'Aurelia Prime',
                activity: { type: 'None' as const },
                inactivity: 'Active' as const,
                vacation: false,
                espionage_eligible: true,
              },
            },
          },
          profiles: [
            {
              player: peer,
              username: 'Arcanis',
              kind: 'bot' as const,
              alliance,
              observed_at: stamp,
              expires_at: stamp + 300,
              insignia: {
                recipe: {
                  version: 1 as const,
                  symbol: 'compass',
                  foreground: '#e3bd80',
                  background: '#152b40',
                },
                asset_url:
                  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 20 20%22%3E%3Ccircle cx=%2210%22 cy=%2210%22 r=%227%22/%3E%3C/svg%3E',
              },
            },
            {
              player: self,
              username: 'Aurelia',
              kind: 'human' as const,
              observed_at: stamp,
              expires_at: stamp + 300,
            },
          ],
        },
      )
      await mount('galaxy-screen')
      const trigger = page.getByRole('link', {
        name: 'Arcanis profile details',
      })
      const popup = page.getByRole('tooltip', { name: 'Arcanis profile' })
      await expect(trigger.getByText('[ASTRA]')).toBeVisible()
      await expect(trigger.locator('[style*="--insignia-mask"]')).toHaveCount(1)
      await expect(trigger.locator('button, a')).toHaveCount(0)
      await expect(page.locator('[data-message-player]')).toHaveCount(0)
      const activity = page.getByRole('button', {
        name: 'Activity within the last 15 minutes',
      })
      await expect(activity.locator('..')).toContainText('Vesper')
      await expect(trigger).not.toContainText('●')
      if (width === 1440) await trigger.hover()
      else await focusPlayerDetails(page, trigger)
      await expect(popup).toBeVisible()
      await expect(popup).toContainText('Automated player')
      await expect(
        popup.getByRole('link', { name: 'Alliance The Astral Accord [ASTRA]' }),
      ).toHaveAttribute('href', `/alliances/${id(3)}/${alliance.id}`)
      await expect(
        popup.getByRole('link', { name: 'Message Arcanis' }),
      ).toHaveAttribute('href', new RegExp(`player=${peer}`))
      await expect(popup).not.toContainText('Activity')
      if (width === 1440) await popup.hover()
      await page.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
      await page.mouse.move(0, 0)
      await focusPlayerDetails(page, trigger)
      await trigger.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(popup).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
      const own = page
        .getByRole('region', { name: 'Galaxy positions' })
        .getByRole('link', { name: 'Aurelia profile details' })
      await focusPlayerDetails(page, own)
      const plain = page.getByRole('tooltip', { name: 'Aurelia profile' })
      await expect(plain).toBeVisible()
      await expect(own.locator('[style*="--insignia-mask"]')).toHaveCount(0)
      await expect(
        plain.locator('[style*="--insignia-mask"], [data-message-player]'),
      ).toHaveCount(0)
      await page.getByLabel('Galaxy', { exact: true }).click()
      await expect(plain).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
  })
}
