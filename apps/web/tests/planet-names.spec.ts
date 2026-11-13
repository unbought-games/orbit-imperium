import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test } from './fixtures/test'
import { binding, body, shellFixture } from './fixtures/game'
import { withBootstrapResponse } from './fixtures/responses'

test('a rejected rename preserves the draft and leaves the confirmed name unchanged', async ({
  page,
}) => {
  await shellFixture(page, {
    protocol: 4,
    bodies: [{ ...body, name: 'Terra' }],
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Rejected',
        code: 'NotOwned',
      },
    })
  })
  await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
  await page.getByRole('textbox', { name: 'Planet name' }).fill('New Terra')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(
    page.getByTestId('game-error-banner').getByRole('alert').filter({ hasText: 'Action rejected:' }),
  ).toContainText('Not Owned')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/unified-rename-error-${width}x900.png`, fullPage: true })
  }
  await expect(page.getByRole('textbox', { name: 'Planet name' })).toHaveValue(
    'New Terra',
  )
  await expect(
    page.getByRole('article', {
      name: 'Terra [1:371:12] dossier',
      exact: true,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(
    page.getByRole('heading', { name: 'Terra', exact: true }),
  ).toBeVisible()
})

test('the fallback label is a valid explicit name for an unnamed planet', async ({
  page,
}) => {
  const planet = { ...body, name: undefined as string | undefined }
  let revision = 1
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    viewerRevision: () => String(revision),
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    expect(pair.gameplay.command.action).toEqual({
      type: 'RenamePlanet',
      body: planet.id,
      name: 'Planet',
    })
    planet.name = pair.gameplay.command.action.name
    revision++
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: String(revision),
      },
    })
  })
  await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
  await page.getByRole('textbox', { name: 'Planet name' }).fill('Planet')
  const save = page.getByRole('button', { name: 'Save name' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(
    page.getByRole('status').filter({ hasText: /^Planet renamed\.$/ }),
  ).toBeVisible()
  expect(planet.name).toBe('Planet')
  await expect(save).toHaveCount(0)
  await withBootstrapResponse(page, () => page.reload())
  await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
  await expect(page.getByRole('textbox', { name: 'Planet name' })).toHaveValue(
    'Planet',
  )
  await expect(save).toBeDisabled()
})
