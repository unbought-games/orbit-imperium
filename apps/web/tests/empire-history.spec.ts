import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/test'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { binding, id } from './fixtures/game'
import type {
  EmpireProfile,
  HistoryEntry,
  HistoricalDetail,
} from '../src/adapters/empire-history'
const player = id(31),
  profile = id(80),
  publication = id(90)
const entries: HistoryEntry[] = [
  {
    id: id(71),
    kind: 'Battle',
    at_ms: 1793808000000,
    facts: { outcome: 'DefenderVictory', commander_name: 'Aurelia' },
    selected: true,
    caption: 'We lost the fleet. We kept the story.',
    featured: true,
    publication: null,
    noteworthy: true,
  },
  {
    id: id(72),
    kind: 'AllianceJoined',
    at_ms: 1793721600000,
    facts: { tag: 'STAR', name: 'The Starward Accord' },
    selected: true,
    caption: 'Found a crew worth flying with.',
    featured: false,
    publication: null,
    noteworthy: false,
  },
  {
    id: id(73),
    kind: 'Colonized',
    at_ms: 1793635200000,
    facts: { fields: 43 },
    selected: false,
    caption: '',
    featured: false,
    publication: null,
    noteworthy: false,
  },
  {
    id: id(74),
    kind: 'Joined',
    at_ms: 1793548800000,
    facts: {},
    selected: true,
    caption: '',
    featured: false,
    publication: null,
    noteworthy: false,
  },
]
function base(): EmpireProfile {
  return {
    player,
    profile,
    universe: binding.universe,
    epoch: binding.epoch,
    universe_name: 'Andromeda',
    username: 'Aurelia',
    display: {
      player,
      username: 'Aurelia',
      kind: 'human',
      supporter_tier: 2,
      observed_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    owner: true,
    public: false,
    removed: false,
    closed: false,
    revision: 0,
    entries: structuredClone(entries),
    next: null,
  }
}
async function fixture(
  page: Page,
  { owner = true, closed = false, removed = false } = {},
) {
  const data = base()
  data.owner = owner
  data.public = !owner
  data.closed = closed
  data.removed = removed
  const requests: unknown[] = []
  await page.route('**/api/v1/session', (route) =>
    owner
      ? route.fulfill({
          json: {
            account: binding.account,
            csrf: 'fixture',
            expires_at: Date.now() + 3600000,
            memberships: [
              {
                player,
                universe: binding.universe,
                universe_name: 'Andromeda',
              },
            ],
          },
        })
      : route.fulfill({ status: 401, json: { code: 'Unauthenticated' } }),
  )
  await page.route('**/api/v4/empire-profiles/**', (route) => {
    const req = route.request()
    if (req.method() === 'POST') {
      const command = req.postDataJSON()
      requests.push(command)
      if (command.action.type === 'Visibility')
        data.public = command.action.public
      if (command.action.type === 'Select') {
        const entry = data.entries.find((e) => e.id === command.action.event)!
        Object.assign(entry, {
          selected: command.action.selected,
          caption: command.action.caption,
          featured: command.action.featured,
        })
      }
      if (command.action.type === 'Publish')
        data.entries.find((e) => e.id === command.action.event)!.publication =
          publication
      data.revision++
      return route.fulfill({ json: { ok: true } })
    }
    const library = new URL(req.url()).searchParams.get('library') === 'true'
    return route.fulfill({
      json: {
        ...data,
        entries: library
          ? data.entries
          : data.entries.filter((e) => e.selected),
      },
    })
  })
  await page.route('**/api/v4/orbit-profiles/**', (route) =>
    route.fulfill({
      json: { id: profile, owner, empires: [{ ...data, entries: [] }] },
    }),
  )
  await page.route('**/api/v4/my-profile', (route) =>
    route.fulfill({
      json: { id: profile, owner, empires: [{ ...data, entries: [] }] },
    }),
  )
  const detail: HistoricalDetail = {
    entry: { ...entries[0], publication },
    player,
    universe_name: 'Andromeda',
    report: {
      report: id(99),
      observed_at: 1793808000000,
      options: { include_identity: true, include_coordinates: true },
      player_names: { 'participant-1': 'Aurelia', 'participant-2': 'Orion' },
      player_alliances: {},
      player_kinds: {},
      payload: {
        kind: 'Combat',
        at: 1793808000000,
        target: { galaxy: 1, system: 42, position: 7 },
        target_name: 'Vesper',
        outcome: 'DefenderVictory',
        participants: [
          {
            owner: 'participant-1',
            side: 'Attacker',
            origin: { Fleet: id(81) },
            technology: [2, 2, 2],
            units: [
              { item: { kind: 'Ship', id: 'LightFighter' }, count: '88' },
            ],
          },
          {
            owner: 'participant-2',
            side: 'Defender',
            origin: { Stationed: id(82) },
            technology: [3, 3, 3],
            units: [{ item: { kind: 'Ship', id: 'Cruiser' }, count: '12' }],
          },
        ],
        rounds: [],
        survivors: [],
        gross_losses: [],
        recovered: [],
        permanent_losses: [],
        debris: {
          metal: '100000000000',
          crystal: '50000000000',
          deuterium: '0',
        },
        loot: { metal: '0', crystal: '0', deuterium: '0' },
      },
    },
  }
  await page.route('**/api/v4/history/**', (route) =>
    route.fulfill({ json: detail }),
  )
  await page.route('**/api/v4/commemorations/**', (route) =>
    route.fulfill({ json: detail }),
  )
  return { data, requests }
}
const loaded = (page: Page, path: string, action: () => Promise<unknown>) =>
  withFixtureResponse(
    page,
    (r) => r.request().method() === 'GET' && new URL(r.url()).pathname === path,
    action,
  )
async function capture(page: Page, name: string, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: `test-results/history-${name}-${width}x1000.png`,
    fullPage: true,
  })
}
for (const width of [1440, 390]) {
  test(`public overview and closed campaign stay readable without game bootstrap at ${width}px`, { tag: (width === 390) ? '@journey' : [] }, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fixture(page, { owner: false, closed: true })
    const api: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/')) api.push(r.url())
    })
    await loaded(page, `/api/v4/orbit-profiles/${profile}`, () =>
      page.goto(`/profiles/${profile}`),
    )
    await expect(
      page.getByRole('heading', { name: 'Andromeda', exact: true }),
    ).toBeVisible()
    await capture(page, 'overview', width)
    await loaded(page, `/api/v4/empire-profiles/${player}`, () =>
      page.getByRole('link', { name: 'Explore this empire' }).click(),
    )
    await expect(
      page.getByRole('heading', { name: /^Aurelia/, level: 1 }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Choose moments' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Message & friend options' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Find your next universe' }),
    ).toBeVisible()
    expect(api.some((url) => /bootstrap|\/view|\/world/.test(url))).toBe(false)
    await capture(page, 'closed-public', width)
  })
}
