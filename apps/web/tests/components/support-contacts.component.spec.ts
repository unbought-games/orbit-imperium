import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
for (const width of [1440, 390]) {
  test.describe(`settings community at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width === 390 })

    test('Discord matches the homepage and supports keyboard or touch navigation', async ({
      page,
      mount,
    }) => {
      await mount('support-contacts')
      const help = page.getByRole('region', {
        name: 'Help and conduct reports',
      })
      await expect(help).toContainText(
        'aim to respond within 24 hours, but response times are not guaranteed.',
      )
      await expect(
        help.getByRole('link', { name: 'support@unbought.games' }),
      ).toHaveAttribute('href', 'mailto:support@unbought.games')
      const community = page.getByRole('region', {
        name: 'Community',
        exact: true,
      })
      const discord = community.getByRole('link', {
        name: 'Join Discord',
        exact: true,
      })
      await expect(discord).toHaveAttribute(
        'href',
        'https://discord.gg/AVMHp7jUcw',
      )
      await discord.scrollIntoViewIfNeeded()
      await expect(discord).toBeInViewport({ ratio: 1 })
      await expect(discord.locator('img')).toHaveAttribute(
        'src',
        '/brand/discord-symbol-white.svg',
      )
      await expect(discord.locator('img')).toBeVisible()
      await expect(discord).toHaveCSS('background-color', 'rgb(88, 101, 242)')
      await expect(discord).toHaveCSS('color', 'rgb(255, 255, 255)')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/settings-community-${width}x900.png`,
      })
      // The global mobile stylesheet suppresses focus rings; verify keyboard
      // focus on desktop and the touch interaction on mobile.
      if (width === 1440) {
        await discord.focus()
        await page.keyboard.press('Tab')
        await page.keyboard.press('Shift+Tab')
        await expect(discord).toBeFocused()
        await expect(discord).toHaveCSS('outline-style', 'solid')
        await expect(discord).toHaveCSS('outline-width', '3px')
        await diagnosticScreenshot(page, {
          path: `test-results/settings-community-focused-${width}x900.png`,
        })
      }
      // Exercise the external navigation without contacting Discord.
      await page.route('https://discord.gg/AVMHp7jUcw', (route) =>
        route.fulfill({ body: 'Discord invite' }),
      )
      if (width === 390) await discord.tap()
      else await discord.press('Enter')
      await expect(page).toHaveURL('https://discord.gg/AVMHp7jUcw')
    })
  })
}
