import { test, expect, type Page } from '@playwright/test'
import {
  shellFixture,
  playerProfilesFixture,
  body,
  binding,
  id,
} from './fixtures/game'

test('supporter preview compares identities without a session or game requests', async ({
  page,
}) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiRequests.push(request.url())
  })
  await page.goto('/supporter-preview')
  const account = page.getByRole('region', { name: 'Account preview' })
  const galaxy = page.getByRole('region', { name: 'Galaxy preview' })
  await expect(
    account.getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(galaxy.getByRole('img', { name: /Supporter/ })).toHaveCount(3)
  await expect(galaxy.getByText('Wayfarer', { exact: true })).toBeVisible()
  await page
    .getByLabel('03 / Try your name')
    .fill('ACommanderWithAnExtraordinarilyLongName')
  await page
    .getByRole('button', { name: 'Preview $100 / month', exact: true })
    .click()
  await expect(
    account.getByRole('img', { name: 'Supporter · $100 / month USD' }),
  ).toBeVisible()
  const name = account.getByText('ACommanderWithAnExtraordinarilyLongName', {
    exact: true,
  })
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(242, 187, 131)')
  await page.getByRole('button', { name: /Aurora/ }).click()
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(240, 203, 122)')
  await page.getByRole('button', { name: /Celestial/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await expect(
    page.getByRole('button', { name: /Signature star/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    account
      .getByRole('img', { name: 'Supporter · $100 / month USD' })
      .locator('svg'),
  ).toHaveClass(/lucide-star/)
  await galaxy.locator('summary').first().click()
  await galaxy.getByRole('button', { name: 'Transport', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'No mission has been sent',
  )
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  expect(apiRequests).toEqual([])
  await page.getByLabel('03 / Try your name').fill('StellarNomad')
  await page.getByRole('button', { name: /Starlight/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await page
    .getByRole('button', { name: 'Preview $25 / month', exact: true })
    .click()
  await page.setViewportSize({ width: 1440, height: 1200 })
  await page.screenshot({
    path: 'test-results/supporter-preview-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: 'test-results/supporter-preview-mobile.png',
    fullPage: true,
  })
})

async function setup(page: Page) {
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
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy, system, position: i + 1 },
            body:
              i < 3
                ? {
                    id: id(i + 20),
                    kind: 'Planet',
                    owner: i === 0 ? binding.player : id(31),
                    activity: { type: 'Recent' },
                    inactivity: 'Active',
                    vacation: false,
                    espionage_eligible: i === 1,
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
  await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
  return {
    setFailure: (value: boolean) => {
      fail = value
    },
  }
}

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
  await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
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
      .getByText('Player 00000000', { exact: true })
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

test('Galaxy uses the signed-in supporter identity for the owned planet', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'oidc', universes: [] } }),
  )
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'StellarNomad', supporter_tier: 2 },
  ])
  await page.reload()
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.first().getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(
    cards.nth(1).getByText('Player 00000000', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.nth(1).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/supporter-live-galaxy.png',
    fullPage: true,
  })
})
