import { installEmpireIdentityFixture } from './fixtures/empire-identity'
import { routeWorld } from './fixtures/game'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { withGalaxyResponse } from './fixtures/galaxy'
import {
  shellFixture,
  binding,
  body,
  playerProfilesFixture,
  matchesFixtureContext,
  id,
} from './fixtures/game'
import type { Page } from '@playwright/test'
import type { components } from '../src/contracts'
import {
  withFixtureResponse,
  trackFixtureResponses,
} from './fixtures/responses'

const fallback = {
  version: 1 as const,
  symbol: 'compass' as const,
  foreground: '#cbb68d',
  background: '#152b40',
}

// Browser ownership: the shared consumer stays mounted during refresh, and a
// new document paints persisted identities before the profile API responds.
test('Galaxy emblems remain visible during refresh and reload from the persistent cache', async ({
  page,
}) => {
  const { state, appearance } = await fixture(page)
  state.designs = [
    { id: id(80), name: 'Cached emblem', revision: 1, recipe: fallback },
  ]
  state.equipped = id(80)
  let held = false
  let removed = false
  const releases: (() => void)[] = []
  const settled = trackFixtureResponses(page, (request) =>
    request.url().endsWith('/player-profiles'),
  )
  await page.route(
    (url) =>
      url.pathname === `/api/v1/universes/${binding.universe}/player-profiles`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { context, source } = route.request().postDataJSON()
      if (
        !matchesFixtureContext(context) ||
        !(
          source?.type === 'SelfAccount' ||
          (source?.type === 'Galaxy' &&
            source.galaxy === 1 &&
            source.system === 371)
        )
      )
        return route.fallback()
      if (held) await new Promise<void>((resolve) => releases.push(resolve))
      const now = Math.floor(Date.now() / 1000)
      await route.fulfill({
        json: {
          ...context,
          players: [
            { player: binding.player, username: 'Aurelia' },
            ...(source.type === 'Galaxy'
              ? [{ player: id(31), username: 'Cassian' }]
              : []),
          ].map((player) => ({
            ...player,
            observed_at: now,
            expires_at: now + 60,
            ...(!removed ? { insignia: appearance() } : {}),
          })),
        },
      })
    },
  )
  await routeWorld(page, (route) => {
    const q = route.request().postDataJSON()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          galaxy: 1,
          system: 371,
          observed_at: Date.now(),
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy: 1, system: 371, position: i + 1 },
            body:
              i === 0 || i === 1
                ? {
                    id: i === 0 ? body.id : id(32),
                    kind: 'Planet',
                    owner: i === 0 ? binding.player : id(31),
                    name: i === 0 ? 'Home' : 'Neighbor',
                    activity: { type: 'None' },
                    inactivity: 'Active',
                    vacation: false,
                    espionage_eligible: true,
                  }
                : null,
            debris: null,
          })),
        },
      },
    })
  })
  const galaxyProfiles = (response: import('@playwright/test').Response) =>
    response.url().endsWith('/player-profiles') &&
    response.request().postDataJSON().source.type === 'Galaxy'
  await withFixtureResponse(page, galaxyProfiles, () =>
    withGalaxyResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/galaxy`),
    ),
  )
  const galaxy = page.getByRole('region', { name: 'Galaxy browser' })
  const emblems = galaxy.locator('span[style*="--insignia-foreground"]')
  await expect(emblems).toHaveCount(2)
  await settled()

  const capture = async (state: string) => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await expect(emblems).toHaveCount(2)
      await expect(emblems.first()).toBeVisible()
      await expect(emblems.last()).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/emblem-galaxy-${state}-${width}x1000.png`,
      })
    }
  }
  try {
    held = true
    await Promise.all([
      page.waitForRequest(
        (request) =>
          request.url().endsWith('/player-profiles') &&
          request.postDataJSON().source.type === 'Galaxy',
      ),
      page.evaluate(() => window.dispatchEvent(new Event('pageshow'))),
    ])
    await capture('refresh-pending')
    await withFixtureResponse(page, galaxyProfiles, async () => {
      held = false
      releases.splice(0).forEach((release) => release())
    })
    await settled()

    held = true
    await Promise.all([
      page.waitForRequest(
        (request) =>
          request.url().endsWith('/player-profiles') &&
          request.postDataJSON().source.type === 'Galaxy',
      ),
      withGalaxyResponse(page, () => page.reload()),
    ])
    await capture('reload-cached')
    removed = true
    await withFixtureResponse(page, galaxyProfiles, async () => {
      held = false
      releases.splice(0).forEach((release) => release())
    })
    await settled()
    await expect(emblems).toHaveCount(0)
  } finally {
    held = false
    releases.splice(0).forEach((release) => release())
    await settled()
  }
})
test.use({ hasTouch: true })

type Design = components['schemas']['InsigniaDesign']
async function fixture(page: Page) {
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await installEmpireIdentityFixture(page)
  const catalog: Array<{
    id: string
    name: string
    supporter: boolean
    asset_url: string
    bytes: Buffer
    group?: 'legacy' | 'center' | 'stripes' | 'accents'
  }> = ['compass', 'wings', 'spire', 'test-star'].map((id, index) => {
    const bytes = readFileSync(
      id === 'test-star'
        ? 'crates/storage-postgres/tests/fixtures/cosmetics/test-star.svg'
        : `crates/application/assets/insignias/${id}.svg`,
    )
    return {
      id,
      name: ['Wayfinder', 'Starwing', 'Ascendant', 'Test star'][index],
      supporter: index === 3,
      asset_url: `/api/media/insignias/${id}/${createHash('sha256').update(bytes).digest('hex')}.svg`,
      bytes,
    }
  })
  for (const item of catalog)
    await page.route(`**${item.asset_url}`, (r) =>
      r.fulfill({ contentType: 'image/svg+xml', body: item.bytes }),
    )
  const state = {
    designs: [] as Design[],
    equipped: null as string | null,
    supporter: false,
  }
  const available = (symbol: string) =>
    symbol !== 'test-star' || state.supporter
  const appearance = () => {
    const selected = state.designs.find((d) => d.id === state.equipped)?.recipe
    if (!selected) return null
    const recipe = available(selected.symbol) ? selected : fallback
    return {
      recipe,
      asset_url: catalog.find((s) => s.id === recipe.symbol)!.asset_url,
    }
  }
  await playerProfilesFixture(page, () => [
    {
      player: binding.player,
      username: 'Aurelia',
      insignia: appearance() ?? undefined,
    },
  ])
  await page.route(
    (url) => url.pathname === `/api/v1/universes/${binding.universe}/insignias`,
    async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { context, action } = route.request().postDataJSON()
      if (
        !matchesFixtureContext(context) ||
        !['Load', 'Save'].includes(action?.type)
      )
        return route.fallback()
      if (action.type === 'Save') {
        if (!available(action.design.recipe.symbol))
          return route.fulfill({ status: 403, json: { code: 'Forbidden' } })
        const design = {
          ...action.design,
          revision: action.design.revision + 1,
        }
        state.designs = state.designs
          .filter((d) => d.id !== design.id)
          .concat(design)
        if (action.equip) state.equipped = design.id
      }
      return route.fulfill({
        json: {
          ...context,
          library: {
            designs: state.designs,
            equipped: state.equipped,
            permanent_symbols: [],
          },
          policy: 'supporter',
          composition_access: state.supporter
            ? 'available'
            : 'supporter_required',
          catalog: catalog.map(({ bytes: _bytes, ...item }) => ({
            ...item,
            access: available(item.id) ? 'available' : 'supporter_required',
          })),
          appearance: appearance(),
          expires_at: Math.floor(Date.now() / 1000) + 30,
        },
      })
    },
  )
  return { state, appearance }
}

// Browser contract: the overview entry preserves body context, lands at the
// editor, and reflects a newly equipped design when returning to the overview.
for (const width of [390]) {
  test('an overview emblem opens its anchored editor and the equipped design reaches both Overview and Galaxy', async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { state, appearance } = await fixture(page)
    state.supporter = true
    // The identity form arrives after the library and grows above the anchor.
    let releaseIdentity!: () => void
    const identityReady = new Promise<void>((resolve) => {
      releaseIdentity = resolve
    })
    await page.route(
      (url) => url.pathname === `/api/v4/empire-profiles/${binding.player}`,
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        await identityReady
        await route.fallback()
      },
    )
    await playerProfilesFixture(page, () => [
      {
        player: binding.player,
        username: 'Aurelia',
        identity: { name: 'Roman Empire', tagline: '', title_id: 'commander' },
        insignia: appearance() ?? undefined,
      },
    ])
    await withFixtureResponse(
      page,
      (r) => r.url().endsWith('/player-profiles'),
      () => page.goto(`/u/andromeda/b/${body.id}/overview`),
    )
    const overview = page.getByRole('region', {
      name: 'Empire overview',
      exact: true,
    })
    const create = overview.getByRole('link', {
      name: 'Create your empire emblem',
      exact: true,
    })
    const destination = `/u/andromeda/b/${body.id}/settings/identity#empire-insignia`
    await expect(create).toHaveAttribute('href', destination)
    await expect(create).toHaveText('')
    await expect(
      overview.getByRole('button', { name: 'Rename empire', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false')
    for (const probeWidth of [1440, 390]) {
      await page.setViewportSize({ width: probeWidth, height: 1000 })
      const bounds = await create.boundingBox()
      expect(bounds!.width).toBeGreaterThanOrEqual(44)
      expect(bounds!.height).toBeGreaterThanOrEqual(44)
    }
    await diagnosticScreenshot(page, {
      path: `test-results/empire-emblem-empty-${width}x1000.png`,
    })
    await withFixtureResponse(
      page,
      (r) =>
        r.url().includes('/empire-profiles/') && r.request().method() === 'GET',
      async () => {
        try {
          await withFixtureResponse(
            page,
            (r) => r.url().endsWith('/insignias'),
            () => create.click(),
          )
        } finally {
          releaseIdentity()
        }
      },
    )
    await expect(page).toHaveURL(new RegExp(`${destination}$`))
    const editor = page.getByRole('region', {
      name: 'Empire insignia',
      exact: true,
    })
    const editorHeading = editor.getByRole('heading', {
      name: 'Empire insignia',
      exact: true,
    })
    await expect(editor).toBeFocused()
    await expect(editorHeading).toBeInViewport()
    await expect(
      editor.getByRole('button', { name: 'New design', exact: true }),
    ).toBeInViewport({ ratio: 1 })
    await diagnosticScreenshot(page, {
      path: `test-results/empire-emblem-destination-${width}x1000.png`,
    })
    await editor
      .getByRole('button', { name: 'New design', exact: true })
      .click()
    await editor
      .getByLabel('Design name', { exact: true })
      .fill('Roman standard')
    await editor.getByRole('button', { name: 'Test star', exact: true }).click()
    await withFixtureResponse(
      page,
      (r) => r.url().endsWith('/player-profiles'),
      () => editor.getByRole('button', { name: 'Save & equip' }).click(),
    )
    await expect(editor.getByRole('status')).toHaveText(
      'Design saved and equipped.',
    )
    // History returns to the original body-specific overview without a new page load.
    await page.goBack()
    const edit = overview.getByRole('link', {
      name: 'Edit your empire emblem',
      exact: true,
    })
    await expect(edit).toBeVisible()
    await expect(edit).toHaveAttribute('href', destination)
    await expect(create).toHaveCount(0)
    await expect(edit.locator('[data-shape]')).toHaveAttribute(
      'data-shape',
      'shield',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/empire-emblem-equipped-${width}x1000.png`,
    })
    await page.setViewportSize({ width: 1440, height: 1000 })
    await withFixtureResponse(
      page,
      (r) => r.url().endsWith('/insignias'),
      () => edit.click(),
    )
    await expect(editorHeading).toBeInViewport()
    await expect(editor.getByLabel('Design name', { exact: true })).toHaveValue(
      'Roman standard',
    )

    await routeWorld(page, (route) => {
      const q = route.request().postDataJSON()
      if (q.type !== 'Galaxy') return route.fallback()
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: q.context.request_id,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: {
            galaxy: 1,
            system: 371,
            observed_at: Date.now(),
            positions: Array.from({ length: 15 }, (_, i) => ({
              coordinates: { galaxy: 1, system: 371, position: i + 1 },
              body:
                i === 11
                  ? {
                      id: body.id,
                      kind: 'Planet',
                      owner: binding.player,
                      name: 'Aurelia',
                      activity: { type: 'None' },
                      inactivity: 'Active',
                      vacation: false,
                      espionage_eligible: true,
                    }
                  : null,
              debris: null,
            })),
          },
        },
      })
    })
    await withGalaxyResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/galaxy`),
    )
    const card = page
      .getByRole('listitem')
      .filter({ hasText: 'Aurelia' })
      .first()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeInViewport()
      await expect(
        card.locator('span[style*="--insignia-foreground"]'),
      ).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
  })
}
