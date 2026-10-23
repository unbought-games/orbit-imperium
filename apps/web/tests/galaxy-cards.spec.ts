import { test, expect, type Page } from '@playwright/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'

async function setup(
  page: Page,
  blocker: components['schemas']['GameError4'] | null = 'BeginnerProtected',
) {
  await shellFixture(page, {
    protocol: 4,
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
  })
  let fail = false
  await page.route('**/world', async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    if (fail)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          galaxy,
          system,
          observed_at: Date.now(),
          player_names: {
            [id(31)]: 'CommanderAndromedaTheUnreasonablyLongName',
          },
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy, system, position: i + 1 },
            body:
              i < 3
                ? {
                    id: i === 0 ? body.id : id(i + 20),
                    kind: 'Planet',
                    owner: i === 0 ? binding.player : id(i === 1 ? 31 : 32),
                    activity: { type: 'Recent' },
                    inactivity: 'Active',
                    vacation: false,
                    attack_blocker: i === 2 ? blocker : null,
                    espionage_eligible:
                      i === 1 || (i === 2 && blocker === null),
                  }
                : null,
            debris:
              i === 1 || i === 3
                ? {
                    field_identity: id(40),
                    metal: '450000000',
                    crystal: '120000000',
                  }
                : null,
          })),
        },
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  return {
    setFailure: (value: boolean) => {
      fail = value
    },
    clearProtection: () => {
      blocker = null
    },
  }
}

test('beginner protection is visible on collapsed cards and blocks both hostile missions until refreshed eligibility changes', async ({
  page,
}) => {
  const fixture = await setup(page)
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  const protectedCard = cards.nth(2)
  const badge = protectedCard.getByText('Beginner protection', { exact: true })
  const explanation = protectedCard.getByText(
    'Beginner protection blocks attacks and espionage between you and this player because of the difference in empire strength.',
    { exact: true },
  )
  await expect(badge).toBeVisible()
  await expect(explanation).toBeVisible()
  await expect(protectedCard.locator('details')).not.toHaveAttribute('open', '')
  await expect(
    cards.nth(0).getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  await expect(
    cards.nth(1).getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  expect(
    await protectedCard
      .locator('details')
      .evaluate((el) => getComputedStyle(el).borderLeftWidth),
  ).toBe('3px')
  const protectedColor = await protectedCard
    .getByText('Player 00000000', { exact: true })
    .evaluate((el) => getComputedStyle(el).color)
  const normalColor = await cards
    .nth(1)
    .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
    .evaluate((el) => getComputedStyle(el).color)
  expect(protectedColor).not.toBe(normalColor)

  await protectedCard.locator('summary').click()
  for (const mission of ['Attack', 'Espionage']) {
    const action = protectedCard.getByRole('button', {
      name: mission,
      exact: true,
    })
    await expect(action).toBeDisabled()
    await expect(action).toHaveAttribute('title', await explanation.innerText())
  }
  await expect(
    protectedCard.getByRole('button', { name: 'Transport', exact: true }),
  ).toBeEnabled()

  fixture.clearProtection()
  await page.getByRole('button', { name: 'Refresh galaxy' }).click()
  await expect(badge).toHaveCount(0)
  await expect(explanation).toHaveCount(0)
  await protectedCard.locator('summary').click()
  await expect(
    protectedCard.getByRole('button', { name: 'Attack', exact: true }),
  ).toBeEnabled()
  await expect(
    protectedCard.getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeEnabled()
})

test('other target blockers disable attack with their own reason without a beginner protection badge', async ({
  page,
}) => {
  await setup(page, 'TargetVacation')
  const card = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(2)
  await expect(
    card.getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  await card.locator('summary').click()
  const attack = card.getByRole('button', { name: 'Attack', exact: true })
  await expect(attack).toBeDisabled()
  await expect(attack).toHaveAttribute(
    'title',
    'This player is in vacation mode. Choose another target or try again after they return.',
  )
})

test('galaxy cards preserve system navigation, eligibility, debris and mission drafts', async ({
  page,
}) => {
  const fixture = await setup(page)
  const positions = page.getByRole('region', { name: 'Galaxy positions' })
  const cards = positions.getByRole('listitem')
  await expect(cards).toHaveCount(15)
  await expect(positions.getByRole('table')).toHaveCount(0)
  await expect(page.getByLabel('Solar system')).toHaveValue('371')
  await expect(cards.nth(0)).toContainText('Your planet')
  await expect(cards.nth(0)).toContainText('You')
  await expect(cards.nth(1)).toContainText(
    'CommanderAndromedaTheUnreasonablyLongName',
  )
  await expect(cards.nth(2)).toContainText('Player 00000000')
  await expect(cards.nth(0).locator('summary')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  await cards.nth(1).locator('summary').click()
  await expect(
    cards.nth(1).getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeEnabled()
  await cards.nth(2).locator('summary').click()
  await expect(
    cards.nth(1).getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  await expect(
    cards.nth(2).getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeDisabled()
  await expect(cards.nth(3)).toContainText('450')
  await cards.nth(3).locator('summary').click()
  await cards
    .nth(3)
    .getByRole('button', { name: 'Harvest', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(
    page.getByRole('combobox', { name: 'Mission', exact: true }),
  ).toHaveValue('Harvest')
  await expect(page.getByLabel('Position', { exact: true })).toHaveValue('4')
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(cards).toHaveCount(15)
  await page.getByLabel('Solar system').selectOption('499')
  await expect(cards.first()).toContainText('[1:499:1]')
  await expect(page.getByRole('button', { name: 'Next system' })).toBeDisabled()
  fixture.setFailure(true)
  await page.getByLabel('Solar system').selectOption('498')
  await expect(page.getByRole('alert')).toContainText('Galaxy unavailable')
  await expect(cards).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  fixture.setFailure(false)
  await page.getByRole('button', { name: 'Refresh galaxy' }).click()
  await expect(cards).toHaveCount(15)
})

for (const mission of ['Transport', 'Attack', 'Espionage']) {
  test(`planet card opens dispatch with ${mission} and the selected destination`, async ({
    page,
  }) => {
    await setup(page)
    const card = page
      .getByRole('region', { name: 'Galaxy positions' })
      .getByRole('listitem')
      .nth(1)
    await card.locator('summary').click()
    await card.getByRole('button', { name: mission, exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Dispatch')
    await expect(
      page.getByRole('combobox', { name: 'Mission', exact: true }),
    ).toHaveValue(mission)
    await expect(page.getByLabel('System', { exact: true })).toHaveValue('371')
    await expect(page.getByLabel('Position', { exact: true })).toHaveValue('2')
  })
}

test('galaxy cards use page scrolling and keep debris beside planets at every width', async ({
  page,
}) => {
  await setup(page)
  const positions = page.getByRole('region', { name: 'Galaxy positions' })
  const cards = positions.getByRole('listitem')
  await cards.nth(1).locator('summary').click()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(cards).toHaveCount(15)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await positions.evaluate((el) => ({
        vertical: el.scrollHeight <= el.clientHeight,
        horizontal: el.scrollWidth <= el.clientWidth,
        overflow: getComputedStyle(el).overflow,
      })),
    ).toEqual({ vertical: true, horizontal: true, overflow: 'visible' })
    const planet = await cards
      .nth(1)
      .getByText('Planet', { exact: true })
      .boundingBox()
    const player = await cards
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
      .boundingBox()
    const debris = await cards
      .nth(1)
      .getByText('Debris field', { exact: true })
      .boundingBox()
    expect(player!.y).toBeGreaterThan(planet!.y)
    expect(debris!.x).toBeGreaterThan(planet!.x + planet!.width)
    await cards.last().scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await page.screenshot({
      path: `test-results/galaxy-cards-${width}.png`,
      fullPage: true,
    })
  }
})

test('planet actions support keyboard opening and Escape focus restoration', async ({
  page,
}) => {
  await setup(page)
  const card = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(1)
  const trigger = card.locator('summary')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(
    card.getByRole('button', { name: 'Transport', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(
    card.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
})

test('incoming fleets and report details use the supplied public name without an identity request', async ({
  page,
}) => {
  const playerNames = { [id(9)]: 'Commander Vega' }
  const identityRequests: string[] = []
  page.on('request', (request) => {
    if (/players|identities/.test(new URL(request.url()).pathname))
      identityRequests.push(request.url())
  })
  await shellFixture(page, { protocol: 4, playerNames })
  await page.getByRole('link', { name: 'Fleet', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Incoming fleets' }),
  ).toContainText('Attack · Commander Vega')
  const reportId = id(62)
  let names: Record<string, string> | undefined = playerNames
  await page.route('**/api/**/reports/**', async (route) => {
    const context = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: reportId,
            kind: 'SpyContact',
            observed_at: Date.now() - 1000,
            read: false,
            hidden: false,
          },
          payload: {
            kind: 'SpyContact',
            at: Date.now() - 1000,
            sender: id(9),
            origin: body.coordinates,
            target: body.coordinates,
            probability_ppm: 0,
            detected: false,
          },
          player_names: names,
        },
      },
    })
  })
  await page.goto(`/u/andromeda/reports/${reportId}?body=${body.id}`)
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report).toContainText('Commander Vega made espionage contact')
  names = undefined
  await page.reload()
  await expect(report).toContainText('Player 00000000 made espionage contact')
  expect(identityRequests).toEqual([])
})
