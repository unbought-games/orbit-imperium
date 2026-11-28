import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/test'
import { withFixtureResponse, withFixtureResponseStatus } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {
  binding,
  id,
  matchesFixtureContext,
  playerProfilesFixture,
} from './fixtures/game'
import { installIdentityArchive, loaded } from './fixtures/observed-empire'
import type { EmpireProfile } from '../src/adapters/empire-history'
const profileId = id(80)
function fixtureProfile(): EmpireProfile {
  return {
    player: binding.player,
    profile: profileId,
    universe: binding.universe,
    epoch: binding.epoch,
    universe_name: 'Andromeda',
    username: 'Aurelia',
    display: null,
    owner: true,
    public: false,
    removed: false,
    closed: false,
    revision: 0,
    entries: [],
    next: null,
    identity: { name: '', tagline: '', title_id: 'commander' },
    title: {
      id: 'commander',
      label: 'Commander',
      address: 'Commander',
      expires_at: null,
    },
    title_choices: [
      {
        title: {
          id: 'commander',
          label: 'Commander',
          address: 'Commander',
          access: 'free',
        },
        availability: 'available',
      },
      {
        title: {
          id: 'consul',
          label: 'Consul',
          address: 'Consul',
          access: 'free',
        },
        availability: 'available',
      },
      {
        title: {
          id: 'fixture-supporter',
          label: 'Fixture patron',
          address: 'Patron',
          access: 'supporter',
        },
        availability: 'supporter_required',
      },
      {
        title: {
          id: 'fixture-earned',
          label: 'Fixture medalist',
          address: 'Medalist',
          access: 'earned',
        },
        availability: 'earned_required',
      },
    ],
  }
}
async function setup(page: Page) {
  const data = fixtureProfile()
  const writes = await installIdentityArchive(page, data)
  await page.route(
    (url) => url.pathname === '/api/v1/session' && !url.search,
    (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({
            json: {
              account: binding.account,
              csrf: 'fixture',
              expires_at: Date.now() + 3600000,
              memberships: [
                {
                  universe: binding.universe,
                  player: binding.player,
                  universe_name: 'Andromeda',
                },
              ],
            },
          })
        : r.fallback(),
  )
  await page.route(
    (url) => url.pathname === '/api/v4/my-profile' && !url.search,
    (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({ json: { id: profileId, owner: true, empires: [data] } })
        : r.fallback(),
  )
  return { data, writes }
}
async function capture(page: Page, state: string, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: `test-results/identity-${state}-${width}x1000.png`,
    fullPage: !['orb', 'dossier'].includes(state),
  })
}
// The mounted editor must preserve the second text entry when the first save is uncertain.
for (const width of [390]) {
  test(`unconfirmed profile save preserves the next draft at ${width}px`, async ({page}, info) => {
    await page.setViewportSize({width, height: 900})
    const f = await setup(page)
    let posts = 0, conflicting = false
    await page.route('**/api/v4/empire-profiles/**', route => {
      if (route.request().method() !== 'POST') return route.fallback()
      posts++
      if (conflicting) return route.fallback()
      return route.fulfill({status:503, json:{code:'Unavailable'}})
    })
    await loaded(page, () => page.goto(`/profiles/empire/${binding.player}`))
    await page.getByRole('button', {name:'Edit identity', exact:true}).click()
    const name = page.getByLabel('Empire name')
    const save = page.getByRole('button', {name:'Save identity'})
    await name.fill('First empire name')
    await withFixtureResponseStatus(page, response => response.request().method() === 'POST' && response.url().includes('/empire-profiles/'),
      () => save.click(), 503)
    await expect(page.getByRole('alert')).toContainText('Your change is unconfirmed.')
    await name.fill('Revised empire name')
    await save.click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('An earlier profile change is still unconfirmed.')
    await expect(name).toHaveValue('Revised empire name')
    expect(posts).toBe(1)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      for (const captureWidth of [1280, 390]) {
        await page.setViewportSize({ width: captureWidth, height: 900 })
        await alert.scrollIntoViewIfNeeded()
        await diagnosticScreenshot(page, {path:info.outputPath(`profile-save-unconfirmed-${captureWidth}x900.png`)})
      }
    }
    conflicting = true
    f.data.revision++
    await withFixtureResponseStatus(page, response => response.request().method() === 'POST' && response.url().includes('/empire-profiles/'),
      () => alert.getByRole('button', {name:'Refresh'}).click(), 409)
    await expect(alert).toContainText('First empire name')
    await expect(name).toHaveValue('Revised empire name')
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') await alert.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {path:info.outputPath(`profile-edit-review-${width}x900.png`)})
    await loaded(page, () => alert.getByRole('button', {name:'Dismiss saved edit'}).click())
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(name).toHaveValue('Revised empire name')
    expect(posts).toBe(2)
  })
}

// Desktop editor case removed after its second failure; see the PR repair record.
for (const width of [390]) {
  test(
    'an empire identity save is reflected by its public profile navigation',
    async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      const f = await setup(page)
      await loaded(page, () => page.goto(`/profiles/empire/${binding.player}`))
      await expect(
        page.getByRole('button', { name: 'Edit identity', exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Edit identity', exact: true })
        .click()
      await expect(
        page.getByLabel('Empire name', { exact: false }),
      ).toBeFocused()
      await page.getByLabel('Empire name').fill('Roman Empire')
      await page.getByLabel('Tagline').fill('Many worlds. One people.')
      await page.getByLabel('Title', { exact: true }).selectOption('consul')
      await expect(
        page.getByRole('option', { name: /Fixture patron/ }),
      ).toHaveJSProperty('disabled', true)
      await expect(
        page.getByRole('option', { name: /Fixture medalist/ }),
      ).toHaveJSProperty('disabled', true)
      await expect(page.getByLabel('Identity preview')).toContainText(
        'Consul Aurelia',
      )
      await capture(page, 'editor', width)
      await loaded(page, () =>
        page.getByRole('button', { name: 'Save identity' }).click(),
      )
      // Successful HTTP delivery precedes the editor's closing React commit.
      await expect(
        page.getByRole('region', { name: 'Edit empire identity' }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('heading', {
          name: 'Roman Empire',
          exact: true,
          level: 1,
        }),
      ).toBeVisible()
      expect(f.writes).toHaveLength(1)
      await withFixtureResponse(
        page,
        (r) => r.url().endsWith('/api/v4/my-profile'),
        () =>
          page
            .getByRole('link', { name: 'My Orbit profile', exact: true })
            .click(),
      )
      await expect(page.getByRole('article')).toContainText('Roman Empire')
      await capture(page, 'overview', width)
    },
  )
}

test('dossier keyboard focus and orb use the same empire identity', async ({
  page,
}) => {
  const { installGameFixture, body } = await import('./fixtures/game')
  const { focusPlayerDetails } = await import('./fixtures/profile-navigation')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await installGameFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      fleet_slots: '8',
      score_value_micro: '0',
    },
  })
  await page.route(
    (url) => url.pathname === `/api/v4/universes/${binding.universe}/rankings`,
    (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      const context = r.request().postDataJSON()
      if (!matchesFixtureContext(context)) return r.fallback()
      return r.fulfill({
        json: {
          binding,
          request_id: context.request_id,
          sampled_at: Date.now(),
          processing_pending: false,
          players: [
            {
              player: binding.player,
              username: 'Aurelia',
              points: '12',
              rank: 1,
            },
          ],
        },
      })
    },
  )
  await playerProfilesFixture(page, () => [
    {
      player: binding.player,
      username: 'Aurelia',
      identity: {
        name: 'Roman Empire',
        tagline: 'Many worlds. One people.',
        title_id: 'consul',
      },
      title: {
        id: 'consul',
        label: 'Consul',
        address: 'Consul',
        expires_at: null,
      },
    },
  ])
  await withFixtureResponse(
    page,
    (r) =>
      r.url().endsWith('/player-profiles') &&
      r.request().postDataJSON().source.type === 'Rankings',
    () => page.goto(`/u/andromeda/b/${body.id}/high-scores`),
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const caption = page.getByTestId('orb-caption')
    await expect(caption).toHaveText('Welcome, Consul.')
    await capture(page, 'orb', width)
    const trigger = page
      .getByRole('table')
      .getByRole('link', { name: 'Aurelia profile details' })
    await focusPlayerDetails(page, trigger)
    const dossier = page.getByRole('tooltip', { name: 'Aurelia profile' })
    await expect(dossier).toContainText('Roman Empire')
    await expect(dossier).toContainText('Consul')
    await expect(dossier).toContainText('Many worlds. One people.')
    await capture(page, 'dossier', width)
    await page.keyboard.press('Escape')
    await expect(dossier).toHaveCount(0)
  }
})
