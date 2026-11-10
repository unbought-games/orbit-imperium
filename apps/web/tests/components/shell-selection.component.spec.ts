import { test, expect, type Locator } from './fixture'

const modes = [
  { name: 'mobile browser', touch: true, installed: false, width: 390 },
  { name: 'installed iOS', touch: true, installed: true, width: 390 },
  { name: 'landscape tablet', touch: true, installed: false, width: 1194 },
  { name: 'desktop', touch: false, installed: false, width: 1440 },
  { name: 'narrow desktop', touch: false, installed: false, width: 390 },
]
async function selectionIs(target: Locator, disabled: boolean) {
  await expect(target).toBeVisible()
  if (disabled) await expect(target).toHaveCSS('-webkit-user-select', 'none')
  else await expect(target).not.toHaveCSS('-webkit-user-select', 'none')
}
for (const mode of modes) {
  test.describe(mode.name, () => {
    test.use({
      hasTouch: mode.touch,
      isMobile: mode.touch,
      viewport: { width: mode.width, height: 900 },
    })
    test('shell controls suppress touch selection while resource details remain copyable', async ({
      page,
      mount,
    }) => {
      if (mode.installed)
        await page.addInitScript(() => {
          Object.defineProperty(navigator, 'standalone', { value: true })
        })
      await mount('shell-default')
      expect(
        await page.evaluate(
          () => matchMedia('(hover: none) and (pointer: coarse)').matches,
        ),
      ).toBe(mode.touch)
      const nav = page.getByRole('navigation', {
        name: 'Main navigation',
        exact: true,
      })
      await selectionIs(
        nav.getByRole('link', { name: 'Develop', exact: true }),
        mode.touch,
      )
      if (mode.width >= 1024)
        await selectionIs(
          page.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true }),
          mode.touch,
        )
      await selectionIs(
        page.getByRole('link', {
          name: 'Energy — resource settings',
          exact: true,
        }),
        mode.touch,
      )
      const metal = page.getByRole('button', {
        name: 'Metal details',
        exact: true,
      })
      if (mode.touch) await selectionIs(metal, true)
      await metal.click()
      const details = page.getByRole('dialog', { name: 'Metal', exact: true })
      await selectionIs(details.getByText('Available', { exact: false }), false)
      await page.keyboard.press('Escape')
      const worlds = page.getByRole('combobox', { name: 'Selected body' })
      if (mode.touch) await selectionIs(worlds, true)
      await worlds.click()
      const option = page.getByRole('option').first()
      if (mode.touch) await selectionIs(option, true)
      await option.click()
      await expect(page.getByRole('listbox')).toHaveCount(0)
    })
  })
}
