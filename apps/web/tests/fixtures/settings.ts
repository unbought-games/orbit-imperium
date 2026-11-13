import type { Page } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { EmpireProfile } from '../../src/adapters/empire-history'
import type { components } from '../../src/contracts'
import { installGameFixture, binding, id, playerProfilesFixture } from './game'
const rewards = JSON.parse(
  readFileSync('contracts/fixtures/community-owner.json', 'utf8'),
)

/** Free local content, with mutable HTTP state for settings navigation/save checks. */
export async function installSettingsFixture(page: Page) {
  await installGameFixture(page, {
    protocol: 4,
    vacation: () => ({
      active: false,
      entered_at: null,
      earliest_exit_at: null,
      blockers: [],
    }),
    missions: {
      fleets: [],
      incoming: [],
      fleet_slots: '8',
      score_value_micro: '0',
    },
    extraCapabilities: ['Attack'],
  })
  const profile: EmpireProfile = {
    player: binding.player,
    profile: id(80),
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
    identity: {
      name: 'Aurelian Commonwealth',
      tagline: 'Many worlds. One horizon.',
      title_id: 'commander',
    },
    title: {
      id: 'commander',
      label: 'Commander',
      address: 'Commander',
      expires_at: null,
    },
    title_choices: [
      'Commander',
      'Captain',
      'Admiral',
      'Consul',
      'Navigator',
      'Explorer',
    ].map((label) => ({
      title: {
        id: label.toLowerCase(),
        label,
        address: label,
        access: 'free' as const,
      },
      availability: 'available' as const,
    })),
  }
  const writes: unknown[] = []
  await page.route('**/api/v4/empire-profiles/**', async (route) => {
    if (route.request().method() === 'POST') {
      const request = route.request().postDataJSON()
      writes.push(request)
      if (request.expected_revision !== profile.revision)
        return route.fulfill({ status: 409, json: { code: 'Conflict' } })
      profile.identity = request.action.identity
      const title = profile.title_choices!.find(
        (c) => c.title.id === profile.identity!.title_id,
      )!.title
      profile.title = {
        id: title.id,
        label: title.label,
        address: title.address,
        expires_at: null,
      }
      profile.revision++
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: profile })
  })
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: profile.username },
  ])
  await page.route('**/api/v1/rewards', (route) =>
    route.fulfill({ json: rewards }),
  )
  const centers = [
    'wayfinder',
    'starwing',
    'ascendant',
    'anvil',
    'helix',
    'quarter-moon',
    'full-circle',
    'triforce',
  ]
  const catalog = readdirSync('crates/application/assets/insignias')
    .filter((file) => file.endsWith('.svg'))
    .map((file) => {
      const symbol = file.slice(0, -4)
      const bytes = readFileSync(`crates/application/assets/insignias/${file}`)
      const group = symbol.startsWith('forge-')
        ? centers.includes(symbol.slice(6))
          ? 'center'
          : 'accents'
        : 'legacy'
      return {
        id: symbol,
        name: symbol.replace('forge-', '').replaceAll('-', ' '),
        group,
        supporter: false,
        access: 'available',
        asset_url: `/api/media/insignias/${symbol}/${createHash('sha256').update(bytes).digest('hex')}.svg`,
        bytes,
      }
    })
  for (const item of catalog)
    await page.route(`**${item.asset_url}`, (route) =>
      route.fulfill({ body: item.bytes, contentType: 'image/svg+xml' }),
    )
  let designs: components['schemas']['InsigniaDesign'][] = []
  let equipped: string | null = null
  await page.route('**/insignias', (route) => {
    const { context, action } = route.request().postDataJSON()
    if (action.type === 'Save') {
      const design = { ...action.design, revision: action.design.revision + 1 }
      designs = designs.filter((d) => d.id !== design.id).concat(design)
      if (action.equip) equipped = design.id
    }
    if (action.type === 'Equip') equipped = action.design_id
    if (action.type === 'Delete') {
      designs = designs.filter((d) => d.id !== action.design_id)
      if (equipped === action.design_id) equipped = null
    }
    return route.fulfill({
      json: {
        ...context,
        library: { designs, equipped, permanent_symbols: [] },
        policy: 'unrestricted',
        composition_access: 'available',
        catalog: catalog.map(({ bytes: _bytes, ...item }) => item),
        appearance: null,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
    })
  })
  return { profile, writes }
}
