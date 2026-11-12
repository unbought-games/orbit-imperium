import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, playerProfilesFixture } from './fixtures/game'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
const ownerFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../contracts/fixtures/community-owner.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
import type { components } from '../src/contracts'
import type { Page } from '@playwright/test'
import { automaticTitlesFixture } from '../src/test-support/automatic-titles'
test.use({ hasTouch: true })
type S = components['schemas']
async function rewardsFixture(page: Page) {
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'Aurelia' },
  ])
  const server = { offline: false }
  const owner = structuredClone(ownerFixture) as S['CommunityOwner']
  const designs: S['InsigniaDesign'][] = []
  const dyes: S['CosmeticDye'][] = owner.milestones[0].options.map((o) => ({
    id: o.item_id,
    name: o.name,
    color: o.preview.color!,
    tier: 'standard',
    access: 'free',
    scope: 'account',
    availability: 'available',
  }))
  const treatments: S['CosmeticTreatment'][] = [
    {
      id: 'sample-brush',
      name: 'Sample brushed',
      family: 'finish',
      renderer: 'surface',
      parameters: { pattern: 'brushed', strength: 0.5, scale: 6, angle: 40 },
      access: 'free',
      scope: 'account',
      surfaces: ['emblem'],
      reduced_motion: 'static',
      availability: 'available',
    },
    {
      id: 'sample-tilt',
      name: 'Sample tilt',
      family: 'interaction',
      renderer: 'interaction',
      parameters: {
        pattern: 'tilt',
        strength: 0.5,
        depth: 8,
        duration_ms: 900,
      },
      access: 'free',
      scope: 'account',
      surfaces: ['emblem'],
      reduced_motion: 'static',
      availability: 'available',
    },
  ]
  const symbols: S['InsigniaSymbol'][] = [
    'compass',
    'forge-wayfinder',
    'forge-crown',
  ].map((id, i) => ({
    id,
    name: ['Wayfinder', 'Center crest', 'Crown'][i],
    group: i === 0 ? 'legacy' : i === 1 ? 'center' : 'accents',
    supporter: false,
    requirement: 'free',
    access: 'available',
    asset_url: `/api/media/insignias/${id}/${createHash('sha256')
      .update(readFileSync(`crates/application/assets/insignias/${id}.svg`))
      .digest('hex')}.svg`,
  }))
  for (const symbol of symbols)
    await page.route(`**${symbol.asset_url}`, (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: readFileSync(
          `crates/application/assets/insignias/${symbol.id}.svg`,
        ),
      }),
    )
  await page.route('**/api/v1/rewards', (route) => {
    for (const invitation of owner.invitations) {
      if (invitation.game_id === 'orbit-imperium')
        invitation.url = new URL(
          `/invite/${encodeURIComponent(invitation.code)}`,
          route.request().url(),
        ).href
    }
    return route.fulfill(
      server.offline
        ? { status: 503, json: { code: 'Unavailable' } }
        : { json: owner },
    )
  })
  await page.route('**/api/v1/rewards/actions', (route) => {
    const { action } = route.request().postDataJSON()
    if (action.type === 'claim') {
      const milestone = owner.milestones.find(
          (m) => m.id === action.milestone_id,
        )!,
        reward = milestone.options.find((o) => o.id === action.reward_id)!
      milestone.remaining--
      milestone.options = milestone.options.filter((o) => o.id !== reward.id)
      owner.collection.push({
        reward_id: reward.id,
        reward: { ...reward },
        permanent: true,
        membership_access: false,
        supported: true,
        delivery: 'account',
      })
      // Strip offer-only fields; the owner collection uses the Reward contract.
      delete (owner.collection.at(-1)!.reward as Partial<typeof reward>).owned
      delete (owner.collection.at(-1)!.reward as Partial<typeof reward>)
        .supported
    }
    return route.fulfill({ json: { contract_version: 1, result: {}, owner } })
  })
  await page.route('**/insignias', (route) => {
    const { context, action } = route.request().postDataJSON()
    if (action.type === 'Save') {
      designs.splice(0, designs.length, {
        ...action.design,
        revision: action.design.revision + 1,
      })
    }
    const recipe = designs[0]?.recipe
    const color = (value: string) =>
      dyes.find((d) => `dye:${d.id}` === value)?.color ?? value
    return route.fulfill({
      json: {
        ...context,
        library: {
          designs,
          equipped: designs[0]?.id ?? null,
          permanent_symbols: [],
        },
        catalog: symbols,
        policy: 'supporter',
        composition_access: 'available',
        dyes,
        treatments,
        expires_at: 4070908800,
        appearance: recipe
          ? {
              recipe,
              asset_url: symbols[0].asset_url,
              layers: recipe.layers?.map((l) => ({
                ...l,
                color: color(l.color),
                asset_url: symbols.find((s) => s.id === l.symbol)!.asset_url,
              })),
              rendering: {
                foreground: color(recipe.foreground),
                background: color(recipe.background),
                finish: treatments.find((t) => t.id === recipe.finish) ?? null,
                effect: treatments.find((t) => t.id === recipe.effect) ?? null,
              },
            }
          : null,
      },
    })
  })
  return { owner, designs, server }
}
for (const width of [1440, 390]) {
  test(`@journey rewards choice confirmation and delivery feedback at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { server, owner } = await rewardsFixture(page)
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards',
      () => page.goto('/u/andromeda/rewards'),
    )
    await expect(
      page.getByRole('heading', { name: 'Community rewards', exact: true }),
    ).toBeVisible()
    const option = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Sample ochre', exact: true }),
    })
    await option.getByRole('button', { name: 'Choose this reward' }).click()
    const dialog = page.getByRole('dialog', { name: 'Choose Sample ochre?' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByRole('button', { name: 'Keep browsing' }),
    ).toBeFocused()
    await diagnosticScreenshot(page, {
      path: `test-results/community-rewards-confirm-${width}x1000.png`,
    })
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards/actions',
      () => dialog.getByRole('button', { name: 'Claim permanently' }).click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Yours permanently: Sample ochre' }),
    ).toBeVisible()
    await expect(
      page.getByText('Choose 1 more', { exact: false }),
    ).toBeVisible()
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width)
    await diagnosticScreenshot(page, {
      path: `test-results/community-rewards-claimed-${width}x1000.png`,
      fullPage: true,
    })
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page
        .getByRole('region', { name: 'Referral milestones', exact: true })
        .scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/community-invitations-${width}x1000.png`,
      })
    }
    server.offline = true
    await withFixtureResponseStatus(
      page,
      (r) =>
        new URL(r.url()).pathname === '/api/v1/rewards' && r.status() === 503,
      () => page.getByRole('button', { name: 'Refresh', exact: true }).click(),
      503,
    )
    await expect(page.getByRole('alert')).toContainText(
      'Rewards are temporarily unavailable',
    )
    await diagnosticScreenshot(page, {
      path: `test-results/community-rewards-unavailable-${width}x1000.png`,
    })
    server.offline = false
    owner.program.status = 'inactive'
    owner.program.start_at = null
    await withFixtureResponse(
      page,
      (r) =>
        new URL(r.url()).pathname === '/api/v1/rewards' && r.status() === 200,
      () => page.getByRole('button', { name: 'Refresh', exact: true }).click(),
    )
    await expect(
      page.getByText('Community rewards are not active on this server.'),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/community-rewards-inactive-${width}x1000.png`,
    })
  })
}

for (const width of [1440, 390]) {
  test(`automatic Renown titles accompany cosmetic choices at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { owner } = await rewardsFixture(page)
    Object.assign(owner, automaticTitlesFixture())
    await withFixtureResponse(
      page,
      (response) => new URL(response.url()).pathname === '/api/v1/rewards',
      () =>
        page.goto(
          `/u/andromeda/b/00000000-0000-4000-8000-000000000005/rewards`,
        ),
    )
    const titles = page.getByRole('region', {
      name: 'Automatic milestone titles',
    })
    await expect(titles).toContainText('Sample Pathfinder')
    await expect(titles).toContainText('Sample Stargazer')
    await expect(titles).toContainText('Sample Voyager')
    await expect(titles).toContainText('Cosmetic choices claimed.')
    await expect(titles).toContainText(
      'Plus 2 cosmetic choices available below.',
    )
    await expect(titles).toContainText('Awarded automatically at 5 Renown')
    await expect(
      titles.getByRole('button', { name: 'Choose this reward' }),
    ).toHaveCount(0)
    await expect(
      titles.getByText('Sample Pathfinder', { exact: true }),
    ).toBeHidden()
    await expect(
      titles.getByRole('link', { name: 'Choose your displayed title' }),
    ).toHaveAttribute('href', `/profiles/empire/${binding.player}`)
    const choices = page.getByRole('region', { name: 'Your reward choices' })
    await expect(
      choices.getByRole('button', { name: 'Choose this reward' }),
    ).toHaveCount(3)
    await expect(
      choices.getByRole('list', { name: 'Automatic title benefit' }),
    ).toContainText('Sample Stargazer')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await titles.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/rewards-automatic-titles-${width}x1000.png`,
        fullPage: true,
      })
    }
    await titles
      .locator('summary')
      .filter({ hasText: 'View all 3 title milestones' })
      .click()
    await expect(
      titles.getByText('Sample Pathfinder', { exact: true }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/rewards-automatic-titles-expanded-${width}x1000.png`,
      fullPage: true,
    })
  })
}
