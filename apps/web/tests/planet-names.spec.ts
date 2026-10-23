import { expect, test } from '@playwright/test'
import { binding, body, id, shellFixture } from './fixtures/game'

for (const width of [1280, 390]) {
  test(`rename persists in the shell and public galaxy at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const planet = { ...body, name: undefined as string | undefined }
    let revision = 1
    await shellFixture(page, {
      protocol: 4,
      bodies: [planet],
      viewerRevision: () => String(revision),
    })
    const submitted: unknown[] = []
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      submitted.push(pair)
      expect(pair.presence.command.action.body).toBe(planet.id)
      expect(pair.gameplay.command.action.body).toBe(planet.id)
      expect(pair.gameplay.command.action.type).toBe('RenamePlanet')
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
    const rename = page.getByRole('button', {
      name: 'Rename planet [1:371:12]',
    })
    await rename.click()
    const form = page.getByRole('form', { name: 'Rename planet [1:371:12]' })
    const input = form.getByRole('textbox', { name: 'Planet name' })
    await expect(input).toBeFocused()
    await input.fill(' ')
    await expect(form.getByRole('button', { name: 'Save name' })).toBeDisabled()
    await input.fill('🪐'.repeat(41))
    await expect(form.getByRole('alert')).toContainText('1–40')
    await input.press('Escape')
    await expect(rename).toBeFocused()
    expect(submitted).toHaveLength(0)
    await rename.click()
    await input.fill('  Terra 世界 🪐  ')
    await input.press('Enter')
    await expect(
      page.getByRole('heading', { name: 'Terra 世界 🪐', exact: true }),
    ).toBeVisible()
    await expect(page.locator('main h1')).toContainText(
      'Terra 世界 🪐 [1:371:12]',
    )
    await expect(
      page
        .getByRole('combobox', { name: 'Selected body' })
        .locator('option:checked'),
    ).toHaveText('Terra 世界 🪐 [1:371:12]')
    await expect(
      page.getByRole('status').filter({ hasText: /^Planet renamed\.$/ }),
    ).toBeVisible()
    expect(submitted).toHaveLength(1)
    await form.getByRole('button', { name: 'Cancel' }).click()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: 'Terra 世界 🪐', exact: true }),
    ).toBeVisible()
    await rename.click()
    await input.fill('🪐'.repeat(40))
    await input.press('Enter')
    await expect(
      page.getByRole('heading', { name: '🪐'.repeat(40), exact: true }),
    ).toBeVisible()
    expect(submitted).toHaveLength(2)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/planet-name-${width}.png`,
      fullPage: true,
    })
    let publicName = 'Other player’s world'
    await page.route('**/world', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: request.context.request_id,
          viewer_revision: String(revision),
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: {
            galaxy: 1,
            system: 371,
            observed_at: Date.now(),
            positions: Array.from({ length: 15 }, (_, index) => ({
              coordinates: { galaxy: 1, system: 371, position: index + 1 },
              body:
                index === 11
                  ? {
                      id: id(91),
                      owner: id(92),
                      kind: 'Planet',
                      name: publicName,
                      activity: { type: 'None' },
                      inactivity: 'Active',
                      vacation: false,
                      espionage_eligible: false,
                    }
                  : null,
              debris: null,
            })),
          },
        },
      })
    })
    await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
    await expect(
      page.getByText('Other player’s world', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Rename planet/ }),
    ).toHaveCount(0)
    publicName = 'W'.repeat(40)
    await page.getByRole('button', { name: 'Refresh galaxy' }).click()
    await expect(page.getByText(publicName, { exact: true })).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

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
    page.getByRole('status').filter({ hasText: /^Action rejected:/ }),
  ).toContainText('Not Owned')
  await expect(page.getByRole('textbox', { name: 'Planet name' })).toHaveValue(
    'New Terra',
  )
  await expect(
    page.getByRole('heading', { name: 'Terra', exact: true }),
  ).toBeVisible()
})

test('active fleet routes show current public names and fit a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const home = { ...body, name: 'T'.repeat(40) }
  const target = {
    id: id(70),
    kind: 'Planet' as const,
    name: 'W'.repeat(40),
    coordinates: { galaxy: 1, system: 371, position: 8 },
  }
  const now = Date.now()
  await shellFixture(page, {
    protocol: 4,
    bodies: [home],
    destinations: [target],
    missions: {
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
      fleets: [
        {
          id: id(71),
          intent: {
            origin: home.id,
            destination: {
              type: 'Body',
              id: target.id,
              expected_kind: 'Planet',
              expected_owner: id(72),
            },
            mission: 'Transport',
            ships: [
              { owner: binding.player, ship_type: 'SmallCargo', count: '1' },
            ],
            cargo: { metal: '0', crystal: '0', deuterium: '0' },
            speed_percent: 100,
          },
          origin: home.coordinates,
          destination: target.coordinates,
          leg: 'Outbound',
          ships: [{ ship_type: 'SmallCargo', count: '1' }],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          due_at: now + 120000,
          launched_at: now,
          duration_ms: 120000,
          paid_fuel: '1000000',
          can_recall: true,
        },
      ],
    },
  })
  await page.goto(`/u/andromeda/fleets/${id(71)}?body=${body.id}`)
  const fleet = page.getByRole('article', { name: 'Transport fleet' })
  await expect(fleet).toContainText(
    `${home.name} [1:371:12] → ${target.name} [1:371:8]`,
  )
  await fleet.getByText('Flight path', { exact: true }).click()
  await expect(fleet.getByTitle(home.name)).toBeVisible()
  await expect(fleet.getByTitle(target.name)).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
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
  await expect(save).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Rename planet [1:371:12]' }).click()
  await expect(page.getByRole('textbox', { name: 'Planet name' })).toHaveValue(
    'Planet',
  )
  await expect(save).toBeDisabled()
})
