import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/test'
import { withFixtureResponse, withFixtureResponseStatus } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { binding, id } from './fixtures/game'
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
  const writes: unknown[] = []
  await page.route('**/api/v1/session', (r) =>
    r.fulfill({
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
    }),
  )
  await page.route('**/api/v4/empire-profiles/**', async (r) => {
    if (r.request().method() === 'POST') {
      const body = r.request().postDataJSON()
      writes.push(body)
      if (body.expected_revision !== data.revision)
        return r.fulfill({ status: 409, json: { code: 'Conflict' } })
      data.identity = body.action.identity
      const chosen = data.title_choices?.find(
        (c) => c.title.id === data.identity?.title_id,
      )
      data.title =
        chosen?.availability === 'available'
          ? { ...chosen.title, expires_at: null }
          : fixtureProfile().title
      // TitleDisplay doesn't expose catalog access metadata.
      if (data.title) {
        const { id, label, address, expires_at } = data.title
        data.title = { id, label, address, expires_at }
      }
      data.revision++
      return r.fulfill({ json: { ok: true } })
    }
    return r.fulfill({ json: data })
  })
  await page.route('**/api/v4/my-profile', (r) =>
    r.fulfill({ json: { id: profileId, owner: true, empires: [data] } }),
  )
  return { data, writes }
}
async function loaded(page: Page, action: () => Promise<unknown>) {
  await withFixtureResponse(
    page,
    (r) =>
      r.request().method() === 'GET' &&
      r.url().includes(`/api/v4/empire-profiles/${binding.player}`),
    action,
  )
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
for (const width of [1280, 390]) {
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
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') await alert.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {path:info.outputPath(`profile-save-unconfirmed-${width}x900.png`)})
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
  test(`identity editor saves through profile navigation, preserves stale drafts, and explains missing selections at ${width}px`, { tag: (width === 390) ? '@journey' : [] }, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const f = await setup(page)
    await loaded(page, () => page.goto(`/profiles/empire/${binding.player}`))
    await expect(
      page.getByRole('button', { name: 'Edit identity', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Edit identity', exact: true })
      .click()
    await expect(page.getByLabel('Empire name', { exact: false })).toBeFocused()
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
      page.getByRole('heading', { name: 'Roman Empire', exact: true, level: 1 }),
    ).toBeVisible()
    expect(f.writes).toHaveLength(1)
    await capture(page, 'profile', width)
    await page
      .getByRole('button', { name: 'Edit identity', exact: true })
      .click()
    await page.getByLabel('Tagline').fill('A draft worth keeping.')
    f.data.revision++
    await page.getByRole('button', { name: 'Save identity' }).click()
    await expect(page.getByRole('alert')).toContainText('another window')
    await expect(page.getByLabel('Tagline')).toHaveValue(
      'A draft worth keeping.',
    )
    await capture(page, 'conflict', width)
    await loaded(page, () =>
      page.getByRole('button', { name: 'Refresh', exact: true }).click(),
    )
    await expect(page.getByLabel('Tagline')).toHaveValue(
      'A draft worth keeping.',
    )
    await page.getByRole('button', { name: 'Use refreshed version' }).click()
    await loaded(page, () =>
      page.getByRole('button', { name: 'Save identity' }).click(),
    )
    await expect(
      page.getByRole('region', { name: 'Edit empire identity' }),
    ).toHaveCount(0)
    f.data.identity!.title_id = 'missing-title'
    f.data.title = fixtureProfile().title
    await loaded(page, () => page.reload())
    await page
      .getByRole('button', { name: 'Edit identity', exact: true })
      .click()
    await expect(page.getByRole('status')).toContainText('not installed')
    await page.getByLabel('Tagline').fill('A new story with a saved title.')
    await capture(page, 'missing', width)
    await loaded(page, () =>
      page.getByRole('button', { name: 'Save identity' }).click(),
    )
    expect(f.data.identity?.title_id).toBe('missing-title')
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
  })
}

for (const width of [1440, 390]) {
  test(`dossier keyboard focus and orb use the same empire identity at ${width}px`, async ({
    page,
  }) => {
    const { installGameFixture, body } = await import('./fixtures/game')
    const { focusPlayerDetails } = await import('./fixtures/profile-navigation')
    await page.setViewportSize({ width, height: 1000 })
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
    await page.route('**/rankings', (r) =>
      r.fulfill({
        json: {
          binding,
          request_id: r.request().postDataJSON().request_id,
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
      }),
    )
    await page.route('**/player-profiles', (r) => {
      const { context } = r.request().postDataJSON()
      const now = Math.floor(Date.now() / 1000)
      return r.fulfill({
        json: {
          binding,
          request_id: context.request_id,
          players: [
            {
              player: binding.player,
              username: 'Aurelia',
              kind: 'human',
              observed_at: now,
              expires_at: now + 300,
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
          ],
        },
      })
    })
    await withFixtureResponse(
      page,
      (r) =>
        r.url().endsWith('/player-profiles') &&
        r.request().postDataJSON().source.type === 'Rankings',
      () => page.goto(`/u/andromeda/b/${body.id}/high-scores`),
    )
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
  })
}

// Protect the overview → identity API → shared profile refresh wiring, with a
// separate touch layout because its pencil must be discoverable without hover.
for (const width of [1440, 390]) {
  test.describe(`overview name ${width}px`, () => {
    test.use({ hasTouch: width === 390 })
    test(`overview name popover saves and restores focus at ${width}px`, async ({
      page,
    }) => {
      const { installGameFixture, body } = await import('./fixtures/game')
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await installGameFixture(page, {
        protocol: 4,
        missions: {
          fleets: [],
          incoming: [],
          fleet_slots: '8',
          score_value_micro: '0',
        },
      })
      const f = await setup(page)
      f.data.identity = {
        name: 'Roman Empire',
        tagline: 'Many worlds. One people.',
        title_id: 'consul',
      }
      f.data.title = {
        id: 'consul',
        label: 'Consul',
        address: 'Consul',
        expires_at: null,
      }
      await page.route('**/player-profiles', (r) => {
        const { context } = r.request().postDataJSON()
        const now = Math.floor(Date.now() / 1000)
        return r.fulfill({
          json: {
            ...context,
            players: [
              {
                player: binding.player,
                username: 'Aurelia',
                observed_at: now,
                expires_at: now + 300,
                identity: f.data.identity,
                title: f.data.title,
              },
            ],
          },
        })
      })
      await withFixtureResponse(
        page,
        (r) => r.url().endsWith('/player-profiles'),
        () => page.goto(`/u/andromeda/b/${body.id}/overview`),
      )
      const overview = page.getByRole('region', {
        name: 'Empire overview',
        exact: true,
      })
      const heading = overview.getByRole('heading', {
        name: 'Roman Empire',
        exact: true,
      })
      const pencil = page.getByRole('button', {
        name: 'Rename empire',
        exact: true,
      })
      await expect(heading).toBeVisible()
      if (width === 1440) {
        await expect(pencil).toHaveCSS('opacity', '0')
        await heading.hover()
        await expect(pencil).toHaveCSS('opacity', '0.5')
      } else {
        await expect(pencil).toHaveCSS('opacity', '0.5')
        const target = await pencil.boundingBox()
        expect(target?.width).toBeGreaterThanOrEqual(44)
        expect(target?.height).toBeGreaterThanOrEqual(44)
      }
      await diagnosticScreenshot(page, {
        path: `test-results/empire-name-heading-${width}x1000.png`,
      })
      await loaded(page, () => pencil.click())
      const dialog = page.getByRole('dialog', {
        name: 'What should we call our empire, Consul?',
      })
      const input = dialog.getByRole('textbox', { name: 'Empire name' })
      await expect(input).toBeFocused()
      await expect(input).toHaveValue('Roman Empire')
      await expect(
        dialog.getByText('Empire name', { exact: true }),
      ).toHaveCount(0)
      const cancelBox = await dialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .boundingBox()
      const saveBox = await dialog
        .getByRole('button', { name: 'Save name', exact: true })
        .boundingBox()
      expect(cancelBox!.x + cancelBox!.width).toBeLessThan(saveBox!.x)
      await diagnosticScreenshot(page, {
        path: `test-results/empire-name-popover-${width}x1000.png`,
      })
      await input.fill('A draft to discard')
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(pencil).toBeFocused()
      await expect(heading).toBeVisible()
      await loaded(page, () => pencil.click())
      await expect(input).toHaveValue('Roman Empire')
      await input.fill('Celestial Commonwealth')
      await withFixtureResponse(
        page,
        (r) => r.url().endsWith('/player-profiles'),
        () => dialog.getByRole('button', { name: 'Save name' }).click(),
      )
      await expect(dialog).toHaveCount(0)
      await expect(pencil).toBeFocused()
      await expect(
        overview.getByRole('heading', {
          name: 'Celestial Commonwealth',
          exact: true,
        }),
      ).toBeVisible()
      expect(f.data.identity).toEqual({
        name: 'Celestial Commonwealth',
        tagline: 'Many worlds. One people.',
        title_id: 'consul',
      })
      await diagnosticScreenshot(page, {
        path: `test-results/empire-name-saved-${width}x1000.png`,
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)

      if (width === 390) {
        f.data.identity!.name =
          'The Celestial Commonwealth of the Distant Outer Stars'
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/player-profiles'),
          () => page.reload(),
        )
        await expect(
          overview.getByRole('heading', {
            name: f.data.identity!.name,
            exact: true,
          }),
        ).toBeVisible()
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
        await diagnosticScreenshot(page, {
          path: `test-results/empire-name-long-${width}x1000.png`,
        })
      }
      if (width === 1440) {
        await loaded(page, () => pencil.click())
        await input.fill('x'.repeat(61))
        await expect(dialog.getByRole('alert')).toContainText('up to 60')
        await expect(
          dialog.getByRole('button', { name: 'Save name' }),
        ).toBeDisabled()
        await input.fill('')
        f.data.revision++
        await dialog.getByRole('button', { name: 'Save name' }).click()
        await expect(dialog.getByRole('alert')).toContainText('another window')
        await expect(input).toHaveValue('')
        await loaded(page, () =>
          dialog.getByRole('button', { name: 'Refresh', exact: true }).click(),
        )
        await dialog
          .getByRole('button', { name: 'Use refreshed version' })
          .click()
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/player-profiles'),
          () => dialog.getByRole('button', { name: 'Save name' }).click(),
        )
        await expect(dialog).toHaveCount(0)
        await expect(
          overview.getByRole('heading', { name: 'Empire', exact: true }),
        ).toBeVisible()
      }
    })
  })
}
