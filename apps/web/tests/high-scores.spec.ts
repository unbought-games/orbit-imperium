import { openNavigation } from './fixtures/navigation'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding, body } from './fixtures/game'
import {
  withBootstrapResponse,
  withRankingsResponse,
} from './fixtures/responses'

test('browser navigation away from player details leaves the destination usable', async ({
  page,
}) => {
  await installGameFixture(page, { protocol: 4 })
  await page.route('**/rankings', (route) =>
    route.fulfill({
      json: {
        binding,
        request_id: route.request().postDataJSON().request_id,
        sampled_at: 1000,
        processing_pending: false,
        players: [
          {
            player: binding.player,
            username: 'Selected Commander',
            points: '12',
            rank: 1,
          },
        ],
      },
    }),
  )
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  await openNavigation(page)
  await withRankingsResponse(page, () =>
    page.getByRole('link', { name: 'High Scores', exact: true }).click(),
  )
  await expect(
    page.getByRole('heading', { name: 'High Scores', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('table')
    .getByRole('button', {
      name: 'Score details for Selected Commander: 12 points',
    })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(
    page.getByRole('heading', { name: 'Empire', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await openNavigation(page)
  await expect(
    page.getByRole('link', { name: 'High Scores', exact: true }),
  ).toBeVisible()
})
