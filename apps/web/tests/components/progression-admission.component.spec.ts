import { expect, test, type Page } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './resources.scenarios'

const cases = [
  {
    kind: 'construction',
    page: 'facilities',
    item: 'RoboticsFactory',
    tile: 'Upgrade Robotics Factory',
    start: 'Confirm upgrade',
    type: 'StartUpgrade',
    cancel: 'CancelConstruction',
    progress: 'Construction progress',
  },
  {
    kind: 'research',
    page: 'research',
    item: 'CombustionDrive',
    tile: 'Research Combustion Drive',
    start: 'Confirm research',
    type: 'StartResearch',
    cancel: 'CancelResearch',
    progress: 'Research progress',
  },
] as const

async function open(page: Page, category: string, aliases = false) {
  const params = new URLSearchParams({
    scenario: 'resources',
    page: category,
    protocol: '3',
  })
  if (aliases) params.set('aliases', 'yes')
  await page.goto('/?' + params)
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
}

for (const item of cases) {
  test(`a held ${item.kind} start focuses its confirming work and rejection restores the mounted action`, async ({
    page,
  }) => {
    await open(page, item.page)
    const row = page.getByRole('link', { name: item.tile, exact: true })
    await row.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const start = pane.getByRole('button', { name: item.start, exact: true })
    await expect(start).toBeEnabled()
    await page.evaluate(() => {
      window.resourceScene.reject(true)
      window.resourceScene.hold()
    })
    const work = pane.getByRole('region', {
      name: `Active ${item.kind}`,
      exact: true,
    })
    try {
      await start.click()
      await expect(work).toContainText('Confirming')
      await expect(work.getByRole('heading')).toBeFocused()
      await expect(
        work.getByRole('button', { name: `Cancel ${item.kind}`, exact: true }),
      ).toBeDisabled()
      await pane.getByRole('link', { name: /^Back to / }).click()
      await expect(
        row.getByRole('group', { name: item.progress }),
      ).toContainText('Confirming')
      await row.click()
      await expect(work).toBeVisible()
      expect(await page.evaluate(() => window.resourceScene.sent.length)).toBe(
        1,
      )
    } finally {
      await page.evaluate(() => window.resourceScene.release())
    }
    await expect(work).toHaveCount(0)
    await expect(start).toBeEnabled()
    await pane.getByRole('link', { name: /^Back to / }).click()
    await expect(row.getByRole('group', { name: item.progress })).toHaveCount(0)
    await expect(row).toBeFocused()
  })
  test(`an accepted pending ${item.kind} is cancelled with its submitted command ID before engine work exists`, async ({
    page,
  }) => {
    await open(page, item.page, true)
    await page.evaluate(() => window.resourceScene.pending(true))
    await page.getByRole('link', { name: item.tile, exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByRole('button', { name: item.start, exact: true }).click()
    const result = pane.getByRole('group', { name: 'Latest action result' })
    await expect(result).toContainText(
      'Order accepted; awaiting the game result.',
    )
    expect(
      await page.evaluate(() => [
        window.resourceScene.view.constructions.length,
        window.resourceScene.view.progression.research_operation ?? null,
      ]),
    ).toEqual([0, null])
    await pane
      .getByRole('button', { name: `Cancel ${item.kind}`, exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: `Cancel ${item.kind}?`,
      exact: true,
    })
    await dialog
      .getByRole('button', { name: 'Yes, cancel', exact: true })
      .click()
    await expect
      .poll(() => page.evaluate(() => window.resourceScene.sent.length))
      .toBe(2)
    const [first, second] = await page.evaluate(() => window.resourceScene.sent)
    expect(first.command).toMatchObject({
      type: item.type,
      ...(item.kind === 'research'
        ? { host: id(5), research: item.item }
        : { body: id(5), building: item.item }),
    })
    expect(second.command).toEqual({
      type: item.cancel,
      operation: first.command_id,
    })
    await expect(result).toContainText(
      item.kind === 'research' ? 'Cancel Research' : 'Cancel Construction',
    )
    await expect(result).not.toContainText('confirmed')
  })
}
