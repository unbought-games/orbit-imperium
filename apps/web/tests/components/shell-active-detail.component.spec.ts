import { expect, test } from './fixture'
import type {} from './resources.scenarios'

test('confirmed completion dismisses the mounted cancellation review without submitting it', async ({
  page,
}) => {
  await page.goto(
    '/?scenario=resources&mode=active&page=resources&item=MetalMine',
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
  await page.evaluate(async () => {
    const scene = window.resourceScene
    // The legacy operation has no confirmed start, so cancellation always
    // requires review, even after the projected finish time.
    delete scene.view.constructions[0].started_at
    scene.view.constructions[0].due_at = scene.view.sampled_at - 1
    await scene.refresh()
  })
  await expect(
    page.getByRole('button', { name: 'Completion time details', exact: true }),
  ).toContainText('Checking completion…')
  await page
    .getByRole('button', { name: 'Cancel construction', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Cancel construction?',
    exact: true,
  })
  await expect(dialog).toContainText('Metal Mine to level 2')
  await page.evaluate(async () => {
    const scene = window.resourceScene
    scene.view.constructions = []
    scene.view.bodies[0].levels.MetalMine = 2
    await scene.refresh()
  })
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Active construction', exact: true }),
  ).toHaveCount(0)
  expect(await page.evaluate(() => window.resourceScene.sent)).toEqual([])
})
