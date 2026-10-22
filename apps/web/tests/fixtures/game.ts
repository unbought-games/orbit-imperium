import { universeSlug } from '../../src/client-model/universe-name'
import { expect, type Page } from '@playwright/test'
import type { components } from '../../src/contracts'

export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const binding = {
  account: id(1),
  player: id(2),
  universe: id(3),
  epoch: id(4),
}
export const resources = {
  metal: '6661686240',
  crystal: '9420339537',
  deuterium: '3122000000',
}
export const body: components['schemas']['BodyV3'] = {
  id: id(5),
  coordinates: { galaxy: 1, system: 371, position: 12 },
  kind: 'Planet',
  amounts: resources,
  capacity: {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  },
  levels: {
    MetalMine: 1,
    CrystalMine: 1,
    DeuteriumSynthesizer: 0,
    SolarPlant: 1,
    MetalStorage: 0,
    CrystalStorage: 0,
    DeuteriumTank: 0,
    RoboticsFactory: 0,
    ResearchLab: 0,
    Shipyard: 0,
  },
  fields: 163,
  fields_used: 3,
  fields_reserved: 1,
  energy: { supply: '48400000', demand: '22000000', utilization: '1000000' },
  inventories: [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' }],
}
export async function shellFixture(
  page: Page,
  options: {
    universeName?: string
    catalog?: components['schemas']['CatalogEntry3'][]
    research?: components['schemas']['Research3'][]
    researchOperation?: components['schemas']['ResearchOperationDto'] | null
    protocol?: 2 | 3 | 4
    missions?: components['schemas']['MissionView4']
    fleets?: components['schemas']['Fleet'][]
    destinations?: components['schemas']['Destination'][]
    commandReferences?: boolean
    manufacturing?: components['schemas']['ManufacturingBatchDto'][]
    production?: components['schemas']['ProductionDto'][]
    constructions?: components['schemas']['Construction3'][]
    bodies?: components['schemas']['BodyV3'][]
    extraCapabilities?: Array<'Attack' | 'Espionage' | 'Harvest' | 'Transport'>
  } = {},
) {
  const protocol = options.protocol ?? 3
  let purchases = 0
  // Fixtures own initial auth/data even when this suite runs against production HTML.
  await page.route('**/api/analytics', (route) =>
    route.fulfill({ json: { enabled: false } }),
  )
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    const html = (await response.text()).replace(
      /(<script id="orbit-bootstrap" type="application\/json">)[\s\S]*?(<\/script>)/,
      '$1$2',
    )
    return route.fulfill({ response, body: html })
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname === '/api/auth/config')
      return route.fulfill({
        json: { mode: 'local', universes: [{ universe: binding.universe, name: options.universeName ?? "Andromeda" }] },
      })
    const context = request.postDataJSON()
    const common = {
      protocol,
      binding,
      request_id:
        context?.request_id ?? url.searchParams.get('request_id') ?? id(80),
      profile_hash: 'a'.repeat(64),
    }
    const session = {
      account: binding.account,
      csrf: 'fixture',
      expires_at: Date.now() + 1000000,
      memberships: [{ universe_name: options.universeName ?? "Andromeda", universe: binding.universe, player: binding.player }],
    }

    if (
      (protocol !== 2 && url.pathname.includes('/v2/')) ||
      (protocol === 4 && url.pathname.includes('/v3/'))
    )
      return route.fulfill({ status: 426, json: { code: 'UpgradeRequired' } })
    if (url.pathname.endsWith('/binding'))
      return route.fulfill({
        json: {
          protocol,
          binding,
          request_id: common.request_id,
          sampled_at: Date.now(),
        },
      })
    const settings = {
      ...common,
      speed: 1,
      profile_id:
        protocol === 4
          ? 'mvp-v1-slice-4'
          : protocol === 2
            ? 'shared-foundation-r1'
            : 'mvp-v1-slice-2',
      galaxies: 1,
      systems_per_galaxy: 499,
      positions_per_system: 15,
    }

    const view = {
      ...common,
      viewer_revision: '1',
      progress: {
        sampled_at: Date.now(),
        scopes: [],
        minimum_revision_pending: false,
        projection_limit: null,
        command_references: options.commandReferences ?? false,
      },
      sampled_at: Date.now(),
      as_of_ms: Date.now(),
      speed: 1,
      bodies: (
        options.bodies ?? [
          body,
          {
            ...body,
            id: id(6),
            kind: 'Moon',
            coordinates: { galaxy: 1, system: 371, position: 13 },
            amounts: { ...resources, metal: '2000000000' },
          },
        ]
      ).map((b) =>
        protocol === 2
          ? {
              ...b,
              production: {
                metal: '63000000',
                crystal: '37000000',
                deuterium: '0',
              },
              levels: {
                MetalMine: b.levels.MetalMine,
                CrystalMine: b.levels.CrystalMine,
                DeuteriumSynthesizer: b.levels.DeuteriumSynthesizer,
                SolarPlant: b.levels.SolarPlant,
              },
            }
          : b,
      ),
      ...(protocol === 4
        ? {
            missions: options.missions ?? {
              fleets: [],
              incoming: [
                {
                  sender: id(9),
                  origin: { galaxy: 1, system: 372, position: 3 },
                  target: body.id,
                  mission: 'Attack',
                  arrival_at: Date.now() + 300000,
                  ships: { visibility: 'Unknown' },
                },
              ],
              score_value_micro: '0',
              fleet_slots: '1',
            },
          }
        : {}),
      destinations: options.destinations ?? [],
      constructions: options.constructions ?? [],
      fleets: options.fleets ?? [],
      reports: [],
      research: options.research ?? [],
      catalog: options.catalog ?? [],
      capabilities: [
        'Construction',
        'Research',
        'Manufacturing',
        'Production',
        'Demolition',
        ...(protocol === 4 ? ['Transport', 'Galaxy'] : []),
        ...(options.extraCapabilities ?? []),
      ]
        .filter(
          (c) => protocol !== 2 || c === 'Construction' || c === 'Transport',
        )
        .map((capability) => ({
          capability,
          enabled: true,
          reason: 'Available',
        })),
      reports_truncated: false,
      destinations_truncated: false,
      ...(protocol !== 2
        ? {
            progression: {
              production: options.production ?? [],
              research_operation: options.researchOperation ?? null,
              manufacturing: options.manufacturing ?? [],
              limits: { max_active_manufacturing_entries: 256 },
            },
          }
        : {}),
    }

    if (url.pathname === '/api/v1/bootstrap')
      return route.fulfill({
        json: {
          version: 1,
          signup_enabled: false,
          result: {
            status: 'authenticated',
            session,
            game: {
              status: 'ready',
              snapshot: {
                request_id: common.request_id,
                candidate: {
                  protocol,
                  binding,
                  request_id: common.request_id,
                  sampled_at: Date.now(),
                },
                view,
                settings,
              },
            },
          },
        },
      })
    if (url.pathname === '/api/v1/session')
      return route.fulfill({ json: session })
    if (url.pathname.endsWith('/settings'))
      return route.fulfill({ json: settings })
    if (url.pathname.endsWith('/overview')) return route.fulfill({ json: view })
    if (url.pathname.endsWith('/presence'))
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: context.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: '1',
        },
      })
    if (url.pathname.endsWith('/commands')) purchases++
    return route.fulfill({ status: 404, json: { code: 'NotFound' } })
  })
  await page.goto(`/u/${universeSlug(options.universeName ?? 'Andromeda')}/b/${body.id}/overview`)
  // A startup connection surface also has an H1; mutations need the ready game.
  await expect(page.locator('main h1')).toContainText('Overview —')
  return () => purchases
}

/** Fixture mutations stand in for authoritative changes; trigger the client's
 * foreground reconciliation instead of depending on an obsolete polling loop. */
export async function refreshGame(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}
