import { test, expect } from './fixture'
for (const width of [320, 390, 768]) {
  for (const textScale of [1, 2]) {
    test(`unread menu badges fit at ${width}px with ${textScale * 100}% text`, async ({
      page,
      mount,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await mount('shell-menu')
      await page.addStyleTag({
        content: `html { font-size: ${textScale * 100}% !important; }`,
      })
      const menu = page.getByRole('link', { name: 'Menu', exact: true })
      const alert = menu.getByRole('status', { name: 'Unread reports' })
      const assertLayout = async () => {
        const target = (await menu.boundingBox())!
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
        await expect(menu).toBeInViewport({ ratio: 1 })
        const label = (await menu
          .getByText('Menu', { exact: true })
          .boundingBox())!
        expect(label.x).toBeGreaterThanOrEqual(target.x)
        expect(label.x + label.width).toBeLessThanOrEqual(
          target.x + target.width,
        )
        if (await alert.count()) {
          const badge = (await alert.boundingBox())!
          // Either beside the desktop label or above the mobile label, with a gap.
          expect(
            badge.x >= label.x + label.width + 4 ||
              badge.y + badge.height + 4 <= label.y,
          ).toBe(true)
          expect(badge.x).toBeGreaterThanOrEqual(target.x)
          expect(badge.x + badge.width).toBeLessThanOrEqual(
            target.x + target.width,
          )
          expect(badge.y).toBeGreaterThanOrEqual(target.y)
          expect(badge.y + badge.height).toBeLessThanOrEqual(
            target.y + target.height,
          )
        }
      }

      await expect(alert).toHaveCount(0)
      await assertLayout()
      await page.evaluate(() => window.setShellReportCount!(12))
      await expect(alert).toBeVisible()
      await expect(menu).toHaveAccessibleDescription('Unread reports')
      await assertLayout()
      const destinations = page.getByRole('navigation', {
        name: 'Menu destinations',
      })
      const reports = destinations.getByRole('link', {
        name: 'Reports — unread reports',
      })
      await expect(reports).toBeVisible()
      await expect(reports.locator('svg')).toHaveCount(2)
      const badge = reports.getByRole('status')
      await expect(badge).toHaveText('12')
      await expect(badge).toHaveAccessibleName('12 unread reports')
      await expect(badge).toHaveCSS('background-color', 'rgb(203, 182, 141)')
      const assertBadgeLayout = async () => {
        const { badgeBox, label, chevron } = await reports.evaluate((row) => {
          const badge = row.querySelector('[role="status"]')!
          const label = [...row.querySelectorAll('span')].find(
            (el) => el.textContent === 'Reports',
          )!
          const icons = row.querySelectorAll('svg')
          return {
            badgeBox: badge.getBoundingClientRect().toJSON(),
            label: label.getBoundingClientRect().toJSON(),
            chevron: icons[icons.length - 1].getBoundingClientRect().toJSON(),
          }
        })
        expect(label.x + label.width).toBeLessThanOrEqual(badgeBox.x)
        expect(badgeBox.x + badgeBox.width + 4).toBeLessThanOrEqual(chevron.x)
        expect(
          Math.abs(
            badgeBox.y + badgeBox.height / 2 - chevron.y - chevron.height / 2,
          ),
        ).toBeLessThan(1)
      }
      await assertBadgeLayout()
      await page.evaluate(() => window.setShellReportCount!(99))
      await expect(badge).toHaveText('99+')
      await expect(badge).toHaveAccessibleName('99 or more unread reports')
      await assertBadgeLayout()
      await page.evaluate(() => window.setShellReportCount!(0))
      await expect(alert).toHaveCount(0)
      await expect(
        page.getByRole('link', { name: 'Reports', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Reports — unread reports' }),
      ).toHaveCount(0)
      await assertLayout()
    })
  }
}
