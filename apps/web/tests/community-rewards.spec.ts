import { test, expect } from './fixtures/test'
import {
  installGameFixture,
  binding,
  playerProfilesFixture,
} from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { Page } from '@playwright/test'
import { automaticTitlesFixture } from '../src/test-support/automatic-titles'
test.use({ hasTouch: true })
async function rewardsFixture(page: Page, accountUrl?: string) {
  await installGameFixture(page, {
    protocol: 4,
    accountUrl,
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
  const owner = automaticTitlesFixture()
  await page.route('**/api/v1/rewards', (route) => {
    for (const invitation of owner.invitations) {
      if (invitation.game_id === 'orbit-imperium')
        invitation.url = new URL(
          `/invite/${encodeURIComponent(invitation.code)}`,
          route.request().url(),
        ).href
    }
    return route.fulfill({ json: owner })
  })
  await page.route('**/api/v1/rewards/actions', (route) => {
    const { action } = route.request().postDataJSON()
    if (action.type !== 'claim') return route.fallback()
    {
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
  await page.route(
    `**/api/v1/universes/${binding.universe}/insignias`,
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { context, action } = route.request().postDataJSON()
      if (action.type !== 'Load') return route.fallback()
      expect(context.binding).toEqual(binding)
      return route.fulfill({
        json: {
          ...context,
          library: { designs: [], equipped: null, permanent_symbols: [] },
          catalog: [],
          policy: 'supporter',
          composition_access: 'available',
          dyes: [],
          treatments: [],
          expires_at: 4070908800,
          appearance: null,
        },
      })
    },
  )
  return { owner }
}
async function openRewardsFromAccount(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 })
  const { owner } = await rewardsFixture(
    page,
    'https://accounts.example/account',
  )
  await withFixtureResponse(
    page,
    (response) => new URL(response.url()).pathname === '/api/v1/rewards',
    () => page.goto('/u/andromeda/b/00000000-0000-4000-8000-000000000005/menu'),
  )
  const menu = page.getByRole('navigation', { name: 'Menu destinations' })
  const account = menu.getByRole('region', { name: 'Account', exact: true })
  await expect(account.getByRole('link')).toHaveText([
    'Rewards',
    'Settings',
    'Unbought Games account',
  ])
  await expect(menu.getByRole('region').last()).toHaveAttribute(
    'aria-label',
    'Account',
  )
  await expect(
    menu
      .getByRole('region', { name: 'Community', exact: true })
      .getByRole('link', { name: 'Rewards', exact: true }),
  ).toHaveCount(0)
  const rewards = account.getByRole('link', { name: 'Rewards', exact: true })
  await rewards.scrollIntoViewIfNeeded()
  await expect(rewards).toBeVisible()
  await expect(rewards).toHaveAttribute(
    'href',
    '/u/andromeda/b/00000000-0000-4000-8000-000000000005/rewards',
  )
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
    await expect(page.getByTestId('orb-caption')).toHaveCount(0, {
      timeout: 10000,
    })
  await diagnosticScreenshot(page, {
    path: `test-results/rewards-account-menu-${width}x900.png`,
  })
  await withFixtureResponse(
    page,
    (response) => new URL(response.url()).pathname === '/api/v1/rewards',
    () => rewards.tap(),
  )
  await expect(page).toHaveURL(
    /\/u\/andromeda\/b\/00000000-0000-4000-8000-000000000005\/rewards$/,
  )
  await expect(
    page.getByRole('heading', { name: 'Community rewards', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('menu', { name: 'Account menu', exact: true }),
  ).toHaveCount(0)
  return owner
}

test(
  'mobile account navigation opens a reward choice and confirms permanent delivery',

  async ({ page }) => {
    const width = 390
    const owner = await openRewardsFromAccount(page, width)
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toHaveCount(0)
    const renown = page.getByRole('link', {
      name: 'View Renown in Unbought Accounts',
      exact: true,
    })
    await expect(renown).toHaveAttribute(
      'href',
      owner.capabilities.full_selection_url,
    )
    for (const viewportWidth of [1440, 390]) {
      await page.setViewportSize({ width: viewportWidth, height: 1000 })
      await expect(renown).toBeInViewport({ ratio: 1 })
    }
    await diagnosticScreenshot(page, {
      path: `test-results/rewards-renown-link-${width}x1000.png`,
    })
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
    for (const viewportWidth of [1440, 390]) {
      await page.setViewportSize({ width: viewportWidth, height: 1000 })
      await expect(page.locator('body')).toHaveJSProperty(
        'scrollWidth',
        viewportWidth,
      )
    }
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
  },
)
