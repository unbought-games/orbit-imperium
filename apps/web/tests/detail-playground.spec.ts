import { body, id, refreshGame, shellFixture } from './fixtures/game'

import type { components } from '../src/contracts'

import { expect, test } from './fixtures/test'

import { withBootstrapResponse } from './fixtures/responses'

test('a completed operation removes its open cancellation confirmation without sending', async ({
  page,
}) => {
  await page.clock.install()
  const planet = structuredClone(body)
  const constructions: components['schemas']['Construction3'][] = [
    {
      id: id(20),
      body: planet.id,
      building: 'MetalMine',
      target_level: 2,
      paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      due_at: Date.now() + 2000,
    },
  ]
  const sent: unknown[] = []
  await shellFixture(page, {
    bodies: [planet],
    constructions,
    catalog: [
      {
        key: { kind: 'Building', id: 'MetalMine' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ],
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/commands')) sent.push(request.postDataJSON())
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${planet.id}/resources/metal-mine`),
  )
  await page.clock.runFor(3000)
  await expect(
    page.getByRole('button', { name: 'Completion time details', exact: true }),
  ).toContainText('Checking completion…')
  await expect(page.getByText('Level 1', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Cancel construction', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Cancel construction?',
    exact: true,
  })
  await expect(dialog).toContainText('Metal Mine to level 2')
  constructions.length = 0
  planet.levels.MetalMine = 2
  await refreshGame(page)
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Active construction', exact: true }),
  ).toHaveCount(0)
  expect(sent).toEqual([])
})
