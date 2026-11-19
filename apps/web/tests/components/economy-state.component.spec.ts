import { expect, test } from './fixture'
import type {} from './progression.scenarios'
import type {} from './resources.scenarios'

for (const first of ['message', 'order'] as const) {
  test(`dismissing the ${first} leaves the other actionable notice mounted`, async ({
    page,
  }) => {
    await page.goto(
      '/?scenario=progression-detail&mode=order&item=RocketLauncher',
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'progression-detail',
    )
    const build = page.getByRole('button', { name: 'Build', exact: true })
    await expect(build).toBeEnabled()
    await page.evaluate(() => window.progressionScene.finishOrder('Rejected'))
    await build.click()
    const order = page.getByRole('group', { name: 'Order status' })
    await expect(order).toContainText('Action rejected')
    await page.evaluate(() =>
      window.progressionScene.model.store.setState({
        message: 'Connect before confirming an action.',
      }),
    )
    const message = page.getByRole('group', { name: 'Current action error' })
    await expect(message).toContainText('Connect before confirming an action.')
    const [dismissed, remaining] =
      first === 'order' ? [order, message] : [message, order]
    await dismissed.getByRole('button', { name: /Dismiss/ }).click()
    await expect(dismissed).toHaveCount(0)
    await expect(remaining).toBeVisible()
    await remaining.getByRole('button', { name: /Dismiss/ }).click()
    await expect(page.getByLabel('Action needs attention')).toHaveCount(0)
  })
}

test('facility row edges and captions stay aligned on both sides of the tile breakpoint', async ({
  page,
}) => {
  await page.goto('/?scenario=resources&page=facilities&mode=active')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  await page.evaluate(async () => {
    const { view, refresh } = window.resourceScene
    view.bodies[0].levels.RoboticsFactory = 4
    Object.assign(view.constructions[0], {
      building: 'RoboticsFactory',
      target_level: 5,
    })
    await refresh()
  })
  const robotics = page.getByRole('link', {
    name: 'Upgrade Robotics Factory',
    exact: true,
  })
  await expect(robotics.getByLabel('Construction progress')).toBeVisible()
  for (const width of [320, 767, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const title of ['Robotics Factory', 'Research Lab', 'Shipyard']) {
      const card = page.getByRole('link', {
        name: `Upgrade ${title}`,
        exact: true,
      })
      const geometry = await card.evaluate((node) => {
        const outer = node.getBoundingClientRect()
        const art = node.children[0].getBoundingClientRect()
        const caption = node.children[1].getBoundingClientRect()
        return {
          indent: art.left - outer.left,
          gap: caption.left - art.right,
          height: outer.height,
        }
      })
      expect(geometry.indent).toBeCloseTo(1, 0)
      expect(geometry.gap).toBeCloseTo(0, 0)
      expect(geometry.height).toBeGreaterThanOrEqual(width >= 768 ? 100 : 44)
      expect(geometry.height).toBeLessThanOrEqual(width >= 768 ? 110 : 60)
      await expect(card).toHaveCSS('text-align', 'left')
    }
  }
})

test('production throttle gives one cooldown notice and waits for an explicit retry', async ({
  page,
}) => {
  await page.goto('/?scenario=resources&page=production&banner=yes')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  await page.evaluate(() => window.resourceScene.throttle(true))
  const metal = page.getByRole('slider', { name: 'metal mine production' })
  await metal.press('Home')
  const banner = page.getByTestId('game-error-banner')
  await expect(banner).toContainText('Try again in 60 seconds.')
  await expect(
    banner.getByRole('group', { name: 'Production settings error' }),
  ).toHaveCount(0)
  await expect(
    page.getByText(/Unable to save production|Saving production changes/),
  ).toHaveCount(0)
  await page.evaluate(async () => {
    const scene = window.resourceScene
    scene.tick(61000)
    await scene.refresh()
  })
  await expect(banner).toContainText('Your production changes weren’t saved.')
  await expect(metal).toHaveValue('0')
  expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(1)
  await page.evaluate(() => window.resourceScene.throttle(false))
  await banner.getByRole('button', { name: 'Retry production changes' }).click()
  await expect(
    page
      .getByRole('region', { name: 'Production controls' })
      .getByRole('status'),
  ).toHaveText('All changes saved automatically.')
  expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(2)
})
