import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {
  shellFixture,
  binding,
  body,
  playerProfilesFixture,
} from './fixtures/game'
import type { Page } from '@playwright/test'
import type { components } from '../src/contracts'

const fallback = {
  version: 1 as const,
  symbol: 'compass' as const,
  foreground: '#cbb68d',
  background: '#152b40',
}
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
  const catalog = ['compass', 'wings', 'spire', 'laurel'].map((id, index) => {
    const bytes = readFileSync(
      `crates/transport-http/assets/insignias/${id}.svg`,
    )
    return {
      id,
      name: ['Wayfinder', 'Starwing', 'Ascendant', 'Laureate'][index],
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
    unknown: false,
    permanent: false,
    fail: false,
  }
  const available = (symbol: string) =>
    symbol !== 'laurel' ||
    state.permanent ||
    (state.supporter && !state.unknown)
  const appearance = () => {
    const selected = state.designs.find((d) => d.id === state.equipped)?.recipe
    const recipe = selected && available(selected.symbol) ? selected : fallback
    return {
      recipe,
      asset_url: catalog.find((s) => s.id === recipe.symbol)!.asset_url,
    }
  }
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'Aurelia', insignia: appearance() },
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
          permanent_symbols: state.permanent ? ['laurel'] : [],
        },
        policy: 'supporter',
        catalog: catalog.map(({ bytes: _bytes, ...item }) => ({
          ...item,
          access: available(item.id)
            ? 'available'
            : state.unknown
              ? 'unavailable'
              : 'supporter_required',
        })),
        appearance: appearance(),
        expires_at: Math.floor(Date.now() / 1000) + 30,
      },
    })
  })
  return { state, appearance }
}
for (const width of [1440, 390]) {
  test(`insignia collection, supporter access and Galaxy identity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { state, appearance } = await fixture(page)
    await page.goto('/u/andromeda/settings')
    const panel = page.getByRole('region', { name: 'Empire insignia' })
    await expect(
      panel.getByRole('button', { name: 'New design' }),
    ).toBeVisible()
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-empty-${width}x1000.png`,
    })
    await panel.getByRole('button', { name: 'New design' }).click()
    await panel
      .getByLabel('Design name', { exact: true })
      .fill('Aurelian expedition')
    await panel.getByRole('button', { name: 'Starwing', exact: true }).click()
    await expect(
      panel.getByRole('button', {
        name: 'Laureate · Supporter access required',
      }),
    ).toBeDisabled()
    await panel.getByLabel('Symbol color', { exact: true }).fill('#f2ca74')
    await panel.getByLabel('Background color', { exact: true }).fill('#743c4c')
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-editing-${width}x1000.png`,
    })
    await panel.getByRole('button', { name: 'Save & equip' }).click()
    await expect(panel.getByRole('status')).toHaveText(
      'Design saved and equipped.',
    )
    await page.reload()
    await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
      'Aurelian expedition',
    )
    expect(state.designs[0].recipe.foreground).toBe('#f2ca74')
    state.supporter = true
    await page.reload()
    await panel.getByRole('button', { name: 'Laureate', exact: true }).click()
    await panel.getByRole('button', { name: 'Save & equip' }).click()
    await expect(panel.getByRole('status')).toHaveText(
      'Design saved and equipped.',
    )
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-supporter-${width}x1000.png`,
    })
    state.supporter = false
    state.unknown = true
    await page.reload()
    await expect(panel).toContainText(
      'Supporter verification is temporarily unavailable',
    )
    await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
      'Aurelian expedition',
    )
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-unavailable-${width}x1000.png`,
    })
    state.permanent = true
    await page.reload()
    await expect(panel.getByLabel('Permanently unlocked')).toBeVisible()
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-permanent-${width}x1000.png`,
    })
    expect(appearance().recipe.symbol).toBe('laurel')
    await page.route('**/world', (route) => {
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
    await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
    const card = page
      .getByRole('listitem')
      .filter({ hasText: 'Aurelia' })
      .first()
    await expect(card).toBeVisible()
    await expect(
      card.locator('span[style*="--insignia-foreground"]'),
    ).toBeVisible()
    await expect(async () => {
      await card.scrollIntoViewIfNeeded()
      await expect(card).toBeInViewport()
    }).toPass({ timeout: 5000 })
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-galaxy-${width}x1000.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
test('failed saves preserve the draft and the library can recover', async ({
  page,
}) => {
  const { state } = await fixture(page)
  await page.goto('/u/andromeda/settings')
  await page.getByRole('button', { name: 'New design' }).click()
  await page.getByLabel('Design name', { exact: true }).fill('Still mine')
  state.fail = true
  await page.getByRole('button', { name: 'Save & equip' }).click()
  await expect(page.getByRole('alert')).toContainText('could not confirm')
  await expect(page.getByLabel('Design name', { exact: true })).toHaveValue(
    'Still mine',
  )
  state.fail = false
  await page.getByRole('button', { name: 'Reload library' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save & equip' }).click()
  await expect(
    page.getByRole('region', { name: 'Empire insignia' }).getByRole('status'),
  ).toContainText('Design saved and equipped.')
  expect(state.designs).toHaveLength(1)
})

for (const width of [1440, 390]) {
  test(`saved collection remains visible without an equipped design at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { state } = await fixture(page)
    await page.goto('/u/andromeda/settings')
    const panel = page.getByRole('region', { name: 'Empire insignia' })
    for (const name of ['First standard', 'Second standard']) {
      await panel.getByRole('button', { name: 'New design' }).click()
      await panel.getByLabel('Design name', { exact: true }).fill(name)
      await panel.getByRole('button', { name: 'Save & equip' }).click()
      await expect(
        panel.getByLabel('Saved designs').locator('option:checked'),
      ).toHaveText(`${name} · Equipped`)
    }
    await panel.getByRole('button', { name: 'Use default insignia' }).click()
    await expect(
      panel.getByRole('button', { name: 'Use default insignia' }),
    ).toHaveCount(0)
    await page.reload()
    await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
      'First standard',
    )
    await expect(panel).not.toContainText('Your collection starts here')
    expect(state.equipped).toBeNull()
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-library-default-${width}x1000.png`,
    })
    await panel
      .getByLabel('Saved designs')
      .selectOption({ label: 'Second standard' })
    await panel
      .getByRole('button', { name: 'Delete design', exact: true })
      .click()
    await expect(panel.getByLabel('Design name', { exact: true })).toHaveValue(
      'First standard',
    )
    await expect(panel).not.toContainText('Your collection starts here')
    expect(state.designs).toHaveLength(1)
    expect(state.equipped).toBeNull()
    await panel.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 72),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/insignia-library-after-delete-${width}x1000.png`,
    })
  })
}
