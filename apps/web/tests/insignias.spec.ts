import { installEmpireIdentityFixture } from './fixtures/empire-identity'
import { routeWorld } from './fixtures/game'
import { focusPlayerDetails } from './fixtures/profile-navigation'
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
  id,
} from './fixtures/game'
import type { Page } from '@playwright/test'
import type { components } from '../src/contracts'
import { withFixtureResponse, withFixtureResponseStatus, trackFixtureResponses } from './fixtures/responses'

const fallback = {
  version: 1 as const,
  symbol: 'compass' as const,
  foreground: '#cbb68d',
  background: '#152b40',
}

// Browser ownership: the shared consumer stays mounted during refresh, and a
// new document paints persisted identities before the profile API responds.
test('Galaxy emblems remain visible during refresh and reload from the persistent cache', async ({ page }) => {
  const { state, appearance } = await fixture(page)
  state.designs = [{ id: id(80), name: 'Cached emblem', revision: 1, recipe: fallback }]
  state.equipped = id(80)
  let held = false
  let removed = false
  const releases: (() => void)[] = []
  const settled = trackFixtureResponses(page, request => request.url().endsWith('/player-profiles'))
  await page.route('**/player-profiles', async route => {
    if (held) await new Promise<void>(resolve => releases.push(resolve))
    const { context } = route.request().postDataJSON()
    const now = Math.floor(Date.now() / 1000)
    await route.fulfill({ json: {
      ...context,
      players: [
        { player: binding.player, username: 'Aurelia' },
        { player: id(31), username: 'Cassian' },
      ].map(player => ({ ...player, observed_at: now, expires_at: now + 60, ...(!removed ? { insignia: appearance() } : {}) })),
    } })
  })
  await routeWorld(page, route => {
    const q = route.request().postDataJSON()
    return route.fulfill({ json: {
      protocol: 4, binding, request_id: q.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(),
      data: { galaxy: 1, system: 371, observed_at: Date.now(), positions: Array.from({ length: 15 }, (_, i) => ({
        coordinates: { galaxy: 1, system: 371, position: i + 1 },
        body: i === 0 || i === 1 ? {
          id: i === 0 ? body.id : id(32), kind: 'Planet', owner: i === 0 ? binding.player : id(31), name: i === 0 ? 'Home' : 'Neighbor',
          activity: { type: 'None' }, inactivity: 'Active', vacation: false, espionage_eligible: true,
        } : null, debris: null,
      })) },
    } })
  })
  const galaxyProfiles = (response: import('@playwright/test').Response) => response.url().endsWith('/player-profiles') && response.request().postDataJSON().source.type === 'Galaxy'
  await withFixtureResponse(page, galaxyProfiles, () => withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/galaxy`)))
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
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(page, { path: `test-results/emblem-galaxy-${state}-${width}x1000.png` })
    }
  }
  held = true
  await Promise.all([
    page.waitForRequest(request => request.url().endsWith('/player-profiles') && request.postDataJSON().source.type === 'Galaxy'),
    page.evaluate(() => window.dispatchEvent(new Event('pageshow'))),
  ])
  await capture('refresh-pending')
  await withFixtureResponse(page, galaxyProfiles, async () => {
    held = false
    releases.splice(0).forEach(release => release())
  })
  await settled()

  held = true
  await Promise.all([
    page.waitForRequest(request => request.url().endsWith('/player-profiles') && request.postDataJSON().source.type === 'Galaxy'),
    withGalaxyResponse(page, () => page.reload()),
  ])
  await capture('reload-cached')
  removed = true
  await withFixtureResponse(page, galaxyProfiles, async () => {
    held = false
    releases.splice(0).forEach(release => release())
  })
  await settled()
  await expect(emblems).toHaveCount(0)
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
  const catalog: Array<{id:string;name:string;supporter:boolean;asset_url:string;bytes:Buffer;group?:'legacy'|'center'|'stripes'|'accents'}> = ['compass', 'wings', 'spire', 'test-star'].map((id, index) => {
    const bytes = readFileSync(
      id === 'test-star' ? 'crates/storage-postgres/tests/fixtures/cosmetics/test-star.svg' : `crates/application/assets/insignias/${id}.svg`,
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
    fail: false,
  }
  const available=(symbol:string)=>symbol!=='test-star'||state.supporter
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
  await page.route('**/insignias', async (route) => {
    if (state.fail)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    const { context, action } = route.request().postDataJSON()
    if (action.type === 'Save') {
      if (!available(action.design.recipe.symbol))
        return route.fulfill({ status: 403, json: { code: 'Forbidden' } })
      const design = { ...action.design, revision: action.design.revision + 1 }
      state.designs = state.designs
        .filter((d) => d.id !== design.id)
        .concat(design)
      if (action.equip) state.equipped = design.id
    }
    if (action.type === 'Equip') state.equipped = action.design_id
    if (action.type === 'Delete') {
      state.designs = state.designs.filter((d) => d.id !== action.design_id)
      if (state.equipped === action.design_id) state.equipped = null
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
        composition_access: state.supporter?'available':'supporter_required',
        catalog: catalog.map(({ bytes: _bytes, ...item }) => ({
          ...item,
          access: available(item.id)
            ? 'available'
            : 'supporter_required',
        })),
        appearance: appearance(),
        expires_at: Math.floor(Date.now() / 1000) + 30,
      },
    })
  })
  return { state, appearance }
}
test('a newly equipped design reaches the Galaxy profile consumer', async ({
  page,
}) => {
  const { state } = await fixture(page)
  state.supporter = true
  await withFixtureResponse(
    page,
    (r) => r.url().endsWith('/insignias'),
    () => page.goto(`/u/andromeda/b/${body.id}/settings/identity`),
  )
  const panel = page.getByRole('region', { name: 'Empire insignia' })
  await panel.getByRole('button', { name: 'New design' }).click()
  await panel.getByRole('button', { name: 'Test star', exact: true }).click()
  await panel.getByRole('button', { name: 'Save & equip' }).click()
  await expect(panel.getByRole('status')).toHaveText(
    'Design saved and equipped.',
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
  const card = page.getByRole('listitem').filter({ hasText: 'Aurelia' }).first()
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
test('failed saves preserve the draft and the library can recover', async ({
  page,
}) => {
  const { state } = await fixture(page)
  await withFixtureResponse(page, (response) => response.url().endsWith('/insignias'), () => page.goto(`/u/andromeda/b/${body.id}/settings/identity`))
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByLabel('Design name', { exact: true }).fill('Still mine')
  const panel = page.getByRole('region', { name: 'Empire insignia', exact: true })
  state.fail = true
  await withFixtureResponseStatus(page, response => response.url().endsWith('/insignias') && response.request().postDataJSON().action.type === 'Save', () => panel.getByRole('button', { name: 'Save & equip' }).click(), 503)
  await expect(panel.getByRole('alert')).toContainText('could not confirm')
  await expect(page.getByLabel('Design name', { exact: true })).toHaveValue(
    'Still mine',
  )
  state.fail = false
  await withFixtureResponse(page, response => response.url().endsWith('/insignias') && response.request().postDataJSON().action.type === 'Load', () => panel.getByRole('button', { name: 'Reload library' }).click())
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save & equip' }).click()
  await expect(
    page.getByRole('region', { name: 'Empire insignia' }).getByRole('status'),
  ).toContainText('Design saved and equipped.')
  expect(state.designs).toHaveLength(1)
})

for (const width of [1440, 390]) {
  test(`player dossier opens by hover, keyboard and tap at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { state, appearance } = await fixture(page)
    const peer = '00000000-0000-4000-8000-000000000031'
    const alliance = {
      id: '00000000-0000-4000-8000-000000000090',
      universe: binding.universe,
      name: 'The Astral Accord',
      tag: 'ASTRA',
    }
    state.designs = [
      {
        id: peer,
        name: 'Starwing',
        recipe: {
          ...fallback,
          symbol: 'wings',
          foreground: '#e3bd80',
          background: '#152b40',
        },
        revision: 1,
      },
    ]
    state.equipped = peer
    await playerProfilesFixture(page, () => [
      {
        player: peer,
        username: 'Arcanis',
        kind: 'bot',
        alliance,
        insignia: appearance()!,
      },
      { player: binding.player, username: 'Aurelia' },
    ])
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
                i < 2
                  ? {
                      id: i === 0 ? peer : body.id,
                      kind: 'Planet',
                      owner: i === 0 ? peer : binding.player,
                      name: i === 0 ? 'Vesper' : 'Aurelia Prime',
                      activity: i === 0 ? { type: 'Recent' } : { type: 'None' },
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
    await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/galaxy`))
    // Full navigation restarts the game session before the world and profile
    // requests run. Check each readiness boundary before asserting identity.
    await expect(
      page.getByRole('heading', { name: 'Galaxy', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Galaxy positions' }),
    ).toBeVisible()
    const trigger = page.getByRole('link', {
      name: 'Arcanis profile details',
    })
    const popup = page.getByRole('tooltip', { name: 'Arcanis profile' })
    await expect(trigger.getByText('[ASTRA]')).toBeVisible()
    await expect(trigger.locator('[style*="--insignia-mask"]')).toHaveCount(1)
    await expect(trigger.locator('button, a')).toHaveCount(0)
    await expect(page.locator('[data-message-player]')).toHaveCount(0)
    const activity = page.getByRole('button', {
      name: 'Activity within the last 15 minutes',
    })
    await expect(activity.locator('..')).toContainText('Vesper')
    await expect(trigger).not.toContainText('●')
    await diagnosticScreenshot(page, {
      path: `test-results/profile-galaxy-${width}x1000.png`,
    })
    if (width === 1440) await trigger.hover()
    else await focusPlayerDetails(page, trigger)
    await expect(popup).toBeVisible()
    await expect(popup).toContainText('Automated player')
    await expect(
      popup.getByRole('link', { name: 'Alliance The Astral Accord [ASTRA]' }),
    ).toHaveAttribute('href', `/alliances/${binding.universe}/${alliance.id}`)
    await expect(
      popup.getByRole('link', { name: 'Message Arcanis' }),
    ).toHaveAttribute('href', new RegExp(`player=${peer}`))
    await expect(popup).not.toContainText('Activity')
    if (width === 1440) await popup.hover()
    await diagnosticScreenshot(page, {
      path: `test-results/profile-open-${width}x1000.png`,
    })
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    await page.mouse.move(0, 0)
    await focusPlayerDetails(page, trigger)
    await trigger.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(popup).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    const own = page
      .getByRole('region', { name: 'Galaxy positions' })
      .getByRole('link', { name: 'Aurelia profile details' })
    await focusPlayerDetails(page, own)
    const plain = page.getByRole('tooltip', { name: 'Aurelia profile' })
    await expect(plain).toBeVisible()
    await expect(own.locator('[style*="--insignia-mask"]')).toHaveCount(0)
    await expect(
      plain.locator('[style*="--insignia-mask"], [data-message-player]'),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/profile-none-${width}x1000.png`,
    })
    await page.getByLabel('Galaxy', { exact: true }).click()
    await expect(plain).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

// Browser contract: the overview entry preserves body context, lands at the
// editor, and reflects a newly equipped design when returning to the overview.
for (const width of [1440, 390]) {
  test(`overview emblem links to the editor and reflects equipment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const { appearance } = await fixture(page)
    // The identity form arrives after the library and grows above the anchor.
    let releaseIdentity!: () => void
    const identityReady = new Promise<void>((resolve) => {
      releaseIdentity = resolve
    })
    await page.route('**/api/v4/empire-profiles/**', async (route) => {
      await identityReady
      await route.fallback()
    })
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
    const bounds = await create.boundingBox()
    expect(bounds!.width).toBeGreaterThanOrEqual(44)
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    await diagnosticScreenshot(page, {
      path: `test-results/empire-emblem-empty-${width}x1000.png`,
    })
    await withFixtureResponse(
      page,
      (r) =>
        r.url().includes('/empire-profiles/') && r.request().method() === 'GET',
      async () => {
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/insignias'),
          () => create.click(),
        )
        releaseIdentity()
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
    await editor.getByRole('button', { name: 'Starwing', exact: true }).click()
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
    await withFixtureResponse(
      page,
      (r) => r.url().endsWith('/insignias'),
      () => edit.click(),
    )
    await expect(editorHeading).toBeInViewport()
    await expect(editor.getByLabel('Design name', { exact: true })).toHaveValue(
      'Roman standard',
    )
  })
}
