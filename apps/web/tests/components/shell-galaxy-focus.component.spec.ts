import { test, expect } from './fixture'
import type {} from './galaxy-screen.scenario'

test('the selected Galaxy row retains its own focus ring as focus enters its coordinate link', async ({
  page,
  mount,
}) => {
  await page.addInitScript(() => {
    window.galaxyInput = { search: '?galaxy=1&system=5&position=12' }
  })
  await mount('galaxy-screen')
  const selected = page.locator('li[aria-current="location"]')
  await expect(selected).toBeFocused()
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await selected.focus()
    await expect(selected).toBeFocused()
    await expect(selected).toHaveCSS('outline-style', 'solid')
    const control = selected.getByRole('link', {
      name: 'View [1:5:12] in galaxy',
      exact: true,
    })
    await expect(control).toHaveCSS('min-height', '24px')
    await control.focus()
    await expect(control).toBeFocused()
    await expect(selected).toHaveCSS('outline-style', 'solid')
    await expect(selected).toHaveCSS('outline-width', '2px')
    expect((await selected.boundingBox())!.height).toBe(
      (await page.locator('#position-11').boundingBox())!.height,
    )
    await expect(
      page.getByText('Selected location', { exact: false }),
    ).toHaveCount(0)
    if (width < 768) await expect(control).toHaveCSS('outline-style', 'none')
  }
})

test('the Galaxy screen explains an out-of-range system without requesting it', async ({
  page,
  mount,
}) => {
  await page.addInitScript(() => {
    window.galaxyInput = { search: '?galaxy=1&system=500&position=12' }
  })
  await mount('galaxy-screen')
  await expect(page.getByRole('alert')).toContainText('outside this universe')
  expect(
    await page.evaluate(() =>
      window.galaxyScene
        .snapshot()
        .calls.filter((query) => query.type === 'Galaxy'),
    ),
  ).toEqual([])
})
