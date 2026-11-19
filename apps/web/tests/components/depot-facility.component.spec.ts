import { test, expect } from './fixture'
import type {} from './resources.scenarios'

test('the installed Alliance Depot facility exposes its holding surface and a confirmed build changes to cancellation', async ({
  page,
}) => {
  await page.goto('/?scenario=resources&page=facilities&item=AllianceDepot')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  await page.evaluate(async () => {
    const scene = window.resourceScene
    scene.view.catalog.find(
      (entry) => entry.key.id === 'AllianceDepot',
    )!.enabled = true
    scene.view.bodies[0].levels.AllianceDepot = 0
    await scene.refresh()
  })
  await expect(
    page.getByRole('heading', { name: 'Alliance Depot', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText(/No allied fleets are holding here/),
  ).toBeVisible()
  const build = page.getByRole('button', {
    name: 'Confirm upgrade',
    exact: true,
  })
  await expect(build).toBeEnabled()
  await build.click()
  await expect(
    page.getByRole('button', { name: /Cancel construction/ }),
  ).toBeVisible()
  const state = await page.evaluate(() => ({
    body: window.resourceScene.view.bodies[0].id,
    commands: window.resourceScene.sent.map((envelope) => envelope.command),
  }))
  expect(state.commands).toHaveLength(1)
  expect(state.commands[0]).toMatchObject({
    type: 'StartUpgrade',
    building: 'AllianceDepot',
    body: state.body,
  })
})
