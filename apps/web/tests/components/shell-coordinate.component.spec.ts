import { test, expect } from './fixture'

test('closing a coordinate menu respects focus moved to its location link', async ({
  page,
  mount,
}) => {
  await mount('shell-coordinates')
  const target = page
    .getByRole('link', {
      name: 'View destination [1:5:12] in galaxy',
      exact: true,
    })
    .first()
  const origin = page
    .getByRole('link', { name: 'View origin [1:2:4] in galaxy', exact: true })
    .first()
  await target.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await origin.focus()
  await expect(menu).toHaveCount(0)
  await expect(origin).toBeFocused()
  await expect(origin).toHaveAttribute(
    'href',
    /galaxy\?galaxy=1&system=2&position=4$/,
  )
})

test.describe('coordinate actions on touch', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  test('long-press opens location actions without following the link', async ({
    page,
    mount,
  }) => {
    await mount('shell-coordinates')
    const initialUrl = page.url()
    const target = page
      .getByRole('link', {
        name: 'View destination [1:5:12] in galaxy',
        exact: true,
      })
      .first()
    await expect(target).toBeVisible()
    await expect(target.locator('..').getByRole('button')).toHaveCount(0)
    const box = (await target.boundingBox())!
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [point],
    })
    await expect(
      page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
    ).toBeVisible()
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await expect(
      page.getByRole('menuitem', { name: 'Copy location link', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveURL(initialUrl)
    await cdp.detach()
  })
})
