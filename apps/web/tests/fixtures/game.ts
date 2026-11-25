import { validate, ContractDataError } from '../../src/client-model/schema'
import { unexpectedFixtureApi } from './api-diagnostics'
import { sameBinding } from '../../src/client-model/commands'
import { withBootstrapResponse } from './responses'
import { productionFixture } from '../../src/test-support/production'
import { fixtureRoutePath } from './navigation'
import { expect, type Page, type Route } from '@playwright/test'
import type { components } from '../../src/contracts'

export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const binding = {
  account: id(1),
  player: id(2),
  universe: id(3),
  epoch: id(4),
}
const boundApi = (version: number, name: string) =>
  `/api/v${version}/universes/${binding.universe}/${name}`

function fixtureContract<T>(schema: string, value: unknown) {
  try {
    return validate<T>(schema, value)
  } catch (error) {
    if (error instanceof ContractDataError) return undefined
    throw error
  }
}
export function matchesFixtureContext(
  value: unknown,
): value is components['schemas']['QueryContext'] {
  const context = fixtureContract<components['schemas']['QueryContext']>(
    'QueryContext',
    value,
  )
  return !!context && sameBinding(context.binding, binding)
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
type UnavailableFixtureReads = {
  progression?: readonly components['schemas']['ProgressionQuoteRequest']['type'][]
  world?: readonly components['schemas']['WorldQueryKind4']['type'][]
  allianceMembership?: boolean
  insigniaLibrary?: boolean
  empireProfile?: string
  invitation?: string
}
const unavailableReads = new WeakMap<Page, UnavailableFixtureReads>()

/** A navigation or layout case can deliberately omit named backend reads.
 * Scenario-specific data handlers still take precedence. Writes and unknown
 * query kinds must always reach the unexpected-operation diagnostic. */
export function refuseFixtureReads(page: Page, reads: UnavailableFixtureReads) {
  unavailableReads.set(page, reads)
}
const installedGames = new WeakMap<
  Page,
  { protocol: number; revision?: () => string }
>()
export function fixtureApiPath(page: Page, resource: string) {
  const game = installedGames.get(page)
  if (!game)
    throw Error('Install the game fixture before sending bound API requests')
  return boundApi(game.protocol, resource)
}
export function inactiveTutorial(route: Route, revision: string) {
  const query = route.request().postDataJSON()
  return route.fulfill({
    json: {
      protocol: 4,
      binding: query.context.binding,
      request_id: query.context.request_id,
      viewer_revision: revision,
      sampled_at: Date.now(),
      as_of_ms: Date.now(),
      data: {
        enrolled: false,
        human: true,
        program: 'colony-opening-v1',
        version: 1,
        preference: null,
        beginner: false,
        completed: false,
        homeworld: null,
        chapters: [],
        recommended_objectives: [],
        receipts: [],
        sites: [],
      },
    },
  })
}
/** World-specific fixtures leave the unrelated, inactive opening query intact. */
export function routeWorld(
  page: Page,
  handler: (route: Route) => unknown | Promise<unknown>,
  options?: { times?: number },
) {
  return page.route(
    `**${boundApi(4, 'world')}`,
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const query = route.request().postDataJSON()
      if (!matchesFixtureContext(query?.context)) return route.fallback()
      return query.type === 'Tutorial'
        ? inactiveTutorial(route, installedGames.get(page)?.revision?.() ?? '1')
        : handler(route)
    },
    options,
  )
}

export function matchesFixtureGameplay(
  value: unknown,
): value is components['schemas']['ForegroundAction4'] {
  const pair = fixtureContract<components['schemas']['ForegroundAction4']>(
    'ForegroundAction4',
    value,
  )
  if (!pair) return false
  const { presence, gameplay } = pair
  const command = presence.command
  return (
    sameBinding(presence.binding, binding) &&
    sameBinding(gameplay.binding, binding) &&
    presence.command_id !== gameplay.command_id &&
    command.type === 'World' &&
    command.action.type === 'RecordForegroundPresence' &&
    command.action.cause === 'GameplayGesture' &&
    command.action.paired_command_id === gameplay.command_id
  )
}

export const fixtureReportPath = (suffix?: string) =>
  boundApi(4, suffix ? `reports/${suffix}` : 'reports')

export function fixtureReportContext(
  route: Route,
  suffix?: string,
): components['schemas']['QueryContext'] {
  const request = route.request()
  if (
    request.method() !== 'POST' ||
    new URL(request.url()).pathname !== fixtureReportPath(suffix)
  )
    return unexpectedFixtureApi(route)
  const payload = request.postDataJSON()
  const schema = !suffix
    ? 'ReportsQuery4'
    : suffix === 'read'
      ? 'ReportsReadRequest'
      : 'QueryContext'
  if (!fixtureContract(schema, payload)) return unexpectedFixtureApi(route)
  const context = !suffix || suffix === 'read' ? payload.context : payload
  if (!sameBinding(context.binding, binding)) return unexpectedFixtureApi(route)
  return context
}

/** Register an acknowledgement only for the header actually installed by the reader. */
export function installReportReadReceipt(
  page: Page,
  header: { id: string; read: boolean },
) {
  return page.route(`**${boundApi(4, 'commands')}`, (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const pair = route.request().postDataJSON()
    const command = pair?.gameplay?.command
    if (
      !matchesFixtureGameplay(pair) ||
      command?.type !== 'World' ||
      command.action?.type !== 'MarkReportRead' ||
      command.action.report !== header.id
    )
      return route.fallback()
    header.read = true
    const now = Date.now()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: installedGames.get(page)?.revision?.() ?? '1',
      },
    })
  })
}

export function installSessionRenewal(
  page: Page,
  csrf: string,
  signedIn = () => true,
) {
  return page.route('**/api/v1/session/renew', (route) => {
    if (
      route.request().method() !== 'POST' ||
      route.request().headers()['x-csrf-token'] !== csrf
    )
      return route.fallback()
    return signedIn()
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 401, json: { code: 'Unauthenticated' } })
  })
}

export async function captureDispatchObservations(page: Page) {
  const samples: components['schemas']['DispatchObservation'][] = []
  await page.route('**/dispatch-observations', async route => {
    samples.push(...route.request().postDataJSON().observations)
    await route.fallback()
  })
  return samples
}

/** Install HTTP fixtures before navigating directly to the page under test. */
export async function installGameFixture(
  page: Page,
  options: {
    speed?: number
    snapshotHeaders?: () => Record<string, string>
    vacation?: () => components['schemas']['VacationView4']
    universeName?: string
    dimensions?: { galaxies: number; systems_per_galaxy: number }
    catalog?: components['schemas']['CatalogEntry3'][]
    research?: components['schemas']['Research3'][]
    researchOperation?: components['schemas']['ResearchOperationDto'] | null
    allianceHonors?: string
    missingReceipt?: (commandId: string) => boolean
    accountUrl?: string
    csrf?: string
    protocol?: 2 | 3 | 4
    hasUnreadReports?: () => boolean
    unreadReportCount?: () => number
    empireDeletion?: () =>
      | components['schemas']['EmpireDeletionStatus4']
      | undefined
    leadsAlliance?: boolean
    viewerRevision?: () => string
    homeworldId?: string
    arrivalPending?: () => boolean
    bodyAppearances?: () => Record<string, number>
    playerNames?: components['schemas']['PublicPlayerNames4']
    attackGroups?: components['schemas']['AttackGroup4'][]
    holdings?: components['schemas']['HeldFleetView4'][]
    depots?: components['schemas']['DepotView4'][]
    missiles?: components['schemas']['MissileFlightView4'][]
    missions?: components['schemas']['MissionView4']
    fleets?: components['schemas']['Fleet'][]
    destinations?: components['schemas']['Destination'][]
    commandReferences?: boolean
    manufacturing?: components['schemas']['ManufacturingBatchDto'][]
    sampledAt?: number | (() => number)
    production?: components['schemas']['ProductionDto'][]
    constructions?: components['schemas']['Construction3'][]
    bodies?: components['schemas']['BodyV3'][]
    extraCapabilities?: Array<
      | 'JumpShips'
      | 'AllianceAttacks'
      | 'Hold'
      | 'Missiles'
      | 'Attack'
      | 'Espionage'
      | 'Harvest'
      | 'Transport'
      | 'Reports'
      | 'Colonize'
      | 'Deploy'
    >
  } = {},
) {
  const protocol = options.protocol ?? 3
  installedGames.set(page, { protocol, revision: options.viewerRevision })
  let purchases = 0
  let signedIn = true
  const csrf = options.csrf ?? 'fixture'
  await installSessionRenewal(page, csrf, () => signedIn)
  // Fixtures own initial auth/data even when this suite runs against production HTML.
  await page.route('**/*', async (route) => {
    if (
      route.request().resourceType() !== 'document' ||
      new URL(route.request().url()).pathname.startsWith('/api/')
    )
      return route.fallback()
    // The local HTML connection can reset during reload. Retry only safe GET
    // transport resets; Playwright still exposes HTTP errors and exhausted retries.
    const response = await route.fetch({
      maxRetries: route.request().method() === 'GET' ? 2 : 0,
    })
    const html = (await response.text()).replace(
      /(<script id="orbit-bootstrap" type="application\/json">)[\s\S]*?(<\/script>)/,
      '$1$2',
    )
    return route.fulfill({ response, body: html })
  })
  let preferences = { galaxy_probe_count: '1' }
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    const sampledAt =
      typeof options.sampledAt === 'function'
        ? options.sampledAt()
        : (options.sampledAt ?? Date.now())
    const is = (method: string, path: string) =>
      request.method() === method && url.pathname === path
    const post = (name: string, version: number = protocol) =>
      is('POST', boundApi(version, name))
    if (post('dispatch-observations', 1) && signedIn && request.headers()['x-csrf-token'] === csrf)
      return route.fulfill({ status: 204 })
    if (
      is('DELETE', '/api/v1/session') &&
      request.headers()['x-csrf-token'] === csrf
    ) {
      signedIn = false
      return route.fulfill({ status: 204 })
    }
    if (!signedIn && is('GET', '/api/v1/bootstrap'))
      return route.fulfill({
        json: {
          version: 1,
          signup_enabled: false,
          result: { status: 'anonymous' },
        },
      })
    if (!signedIn && is('GET', '/api/v1/session'))
      return route.fulfill({ status: 401, json: { code: 'Unauthorized' } })
    if (
      options.allianceHonors &&
      is('GET', `/api/v1/rewards/alliances/${options.allianceHonors}/honors`)
    )
      return route.fulfill({
        json: { alliance_id: options.allianceHonors, honors: [] },
      })
    const commandId = url.pathname.split('/').at(-1)
    if (
      commandId &&
      is('GET', boundApi(protocol, `commands/${commandId}`)) &&
      url.searchParams.get('epoch') === binding.epoch &&
      options.missingReceipt?.(commandId)
    )
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    if (is('GET', '/api/auth/config'))
      return route.fulfill({
        json: {
          mode: 'local',
          account_url: options.accountUrl,
          universes: [
            {
              universe: binding.universe,
              name: options.universeName ?? 'Andromeda',
            },
          ],
        },
      })
    if (url.pathname === '/api/announcements') return route.fallback()
    let context
    try {
      context = request.postDataJSON()
    } catch {
      return route.fallback()
    }
    // Query and command envelopes select the actor and epoch as well as the URL.
    if (request.method() === 'POST' && url.pathname.includes('/universes/')) {
      const envelope = context?.context ?? context?.gameplay ?? context
      if (
        !envelope?.binding ||
        !sameBinding(envelope.binding, binding) ||
        typeof (envelope.request_id ?? envelope.command_id) !== 'string'
      )
        return route.fallback()
    }
    // The development shell asks for its optional ship designs on mount and
    // the overview loads the player's public name. Customization tests supply
    // these observations. Only their passive reads are unavailable by default.
    if (
      (post('ship-appearances', 1) && context?.action?.type === 'Load') ||
      (is('GET', `/api/v4/empire-profiles/${binding.player}`) &&
        url.searchParams.get('library') === 'false')
    )
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    if (post('player-preferences', 1)) {
      if (context.preferences) preferences = context.preferences
      return route.fulfill({ json: { ...context.context, preferences } })
    }
    if (post('world', 4) && context?.type === 'Tutorial')
      return inactiveTutorial(route, options.viewerRevision?.() ?? '1')
    if (
      post('player-profiles', 1) &&
      ['SelfAccount', 'Incoming', 'Galaxy', 'Rankings', 'Report'].includes(
        context?.source?.type,
      )
    )
      return route.fulfill({
        json: {
          binding: context.context.binding,
          request_id: context.context.request_id,
          players: [],
        },
      })
    const common = {
      protocol,
      binding,
      request_id:
        context?.request_id ?? url.searchParams.get('request_id') ?? id(80),
      profile_hash: 'a'.repeat(64),
    }
    const session = {
      account: binding.account,
      csrf,
      expires_at: Date.now() + 1000000,
      memberships: [
        {
          universe_name: options.universeName ?? 'Andromeda',
          universe: binding.universe,
          player: binding.player,
        },
      ],
    }

    if (
      (protocol !== 2 && is('GET', boundApi(2, 'binding'))) ||
      (protocol === 4 && is('GET', boundApi(3, 'binding')))
    )
      return route.fulfill({ status: 426, json: { code: 'UpgradeRequired' } })
    if (is('GET', boundApi(protocol, 'binding')))
      return route.fulfill({
        json: {
          protocol,
          binding,
          request_id: common.request_id,
          sampled_at: sampledAt,
        },
      })
    if (
      is('GET', boundApi(4, 'updates')) &&
      url.searchParams.get('epoch') === binding.epoch
    )
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    const settings = {
      ...common,
      speed: options.speed ?? 1,
      profile_id:
        protocol === 4
          ? 'mvp-v1-slice-4'
          : protocol === 2
            ? 'shared-foundation-r1'
            : 'mvp-v1-slice-2',
      galaxies: 1,
      systems_per_galaxy: 499,
      positions_per_system: 15,
      ...options.dimensions,
    }

    const bodies: components['schemas']['BodyV3'][] = options.bodies ?? [
      body,
      {
        ...body,
        id: id(6),
        kind: 'Moon',
        coordinates: { galaxy: 1, system: 371, position: 13 },
        amounts: { ...resources, metal: '2000000000' },
      },
    ]

    const view = {
      ...common,
      viewer_revision: options.viewerRevision?.() ?? '1',
      progress: {
        sampled_at: sampledAt,
        scopes: [],
        minimum_revision_pending: false,
        projection_limit: null,
        command_references: options.commandReferences ?? false,
      },
      sampled_at: sampledAt,
      as_of_ms: sampledAt,
      speed: options.speed ?? 1,
      ...(protocol === 4 && options.homeworldId
        ? { homeworld_id: options.homeworldId }
        : {}),
      bodies: bodies.map((b) =>
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
            empire_deletion: options.empireDeletion?.(),
            leads_alliance: options.leadsAlliance ?? false,
            vacation: options.vacation?.() ?? {
              active: false,
              entered_at: null,
              earliest_exit_at: null,
              blockers: [],
            },
            attack_groups: options.attackGroups ?? [],
            holdings: options.holdings ?? [],
            depots: options.depots ?? [],
            missiles: options.missiles ?? [],
            has_unread_reports: options.hasUnreadReports?.() ?? false,
            player_names: options.playerNames,
            arrival_pending: options.arrivalPending?.() ?? false,
            body_appearances: options.bodyAppearances?.() ?? {},
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
              production: bodies.map(
                (b) =>
                  options.production?.find((entry) => entry.body === b.id) ??
                  productionFixture(b),
              ),
              research_operation: options.researchOperation ?? null,
              manufacturing: options.manufacturing ?? [],
              limits: { max_active_manufacturing_entries: 256 },
            },
          }
        : {}),
    }

    if (is('GET', '/api/v1/bootstrap'))
      return route.fulfill({
        headers: options.snapshotHeaders?.(),
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
                  sampled_at: sampledAt,
                },
                view,
                settings,
              },
            },
          },
        },
      })
    if (is('GET', '/api/v1/rewards'))
      return route.fulfill({ json: { enabled: false } })
    if (is('GET', '/api/v1/session')) return route.fulfill({ json: session })
    if (
      (post('settings') || post('overview')) &&
      !matchesFixtureContext(context)
    )
      return unexpectedFixtureApi(route)
    if (post('settings')) return route.fulfill({ json: settings })
    if (post('overview'))
      return route.fulfill({ json: view, headers: options.snapshotHeaders?.() })
    if (
      post('presence', 4) &&
      context?.command?.action?.type === 'RecordForegroundPresence'
    )
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: context.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: options.viewerRevision?.() ?? '1',
        },
      })
    if (
      post('social/query', 4) &&
      ['Conversations', 'Messages', 'Circulars', 'Contacts'].includes(
        context?.query?.type,
      )
    )
      return route.fulfill({
        json: {
          ...context.context,
          conversations: [],
          messages: [],
          circulars: [],
          contacts: [],
          contact: null,
          next_cursor: null,
        },
      })
    if (protocol === 4 && post('reports'))
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: fixtureReportContext(route).request_id,
          viewer_revision: options.viewerRevision?.() ?? '1',
          sampled_at: sampledAt,
          as_of_ms: sampledAt,
          data: {
            items: Array.from(
              {
                length:
                  options.unreadReportCount?.() ??
                  (options.hasUnreadReports?.() ? 1 : 0),
              },
              (_, index) => ({
                id: id(900 + index),
                kind: 'SpyContact',
                read: false,
                hidden: false,
                observed_at: sampledAt,
              }),
            ),
            next_cursor: null,
            has_more: false,
            as_of_ms: sampledAt,
          },
        },
      })
    const refused = unavailableReads.get(page)
    if (
      (refused?.allianceMembership &&
        post('alliances/query', 4) &&
        context?.query?.type === 'Mine') ||
      (refused?.insigniaLibrary &&
        post('insignias', 1) &&
        context?.action?.type === 'Load') ||
      (refused?.empireProfile &&
        is('GET', `/api/v4/empire-profiles/${refused.empireProfile}`)) ||
      (refused?.invitation &&
        is('GET', boundApi(4, `invitations/${refused.invitation}`)))
    )
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    if (
      refused?.world &&
      post('world', 4) &&
      refused.world.includes(context?.type)
    )
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    if (
      refused?.progression &&
      (post('progression-options') || post('progression-options/bulk'))
    ) {
      const items = post('progression-options/bulk')
        ? context.requests
        : [context.request]
      if (
        Array.isArray(items) &&
        items.length &&
        items.every(
          (item) =>
            refused.progression!.includes(item?.type) &&
            bodies.some((body) => body.id === (item.body ?? item.host)),
        )
      )
        return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    }
    if (post('commands')) purchases++
    return route.fallback()
  })
  return () => purchases
}

/** Tests of the shell and navigation still start from the ready overview. */
export async function shellFixture(
  page: Page,
  options: Parameters<typeof installGameFixture>[1] = {},
) {
  const purchases = await installGameFixture(page, options)
  await withBootstrapResponse(page, () =>
    page.goto(
      fixtureRoutePath(
        options.universeName ?? 'Andromeda',
        'overview',
        body.id,
      ),
    ),
  )
  // A startup connection surface also has an H1; mutations need the ready game.
  await expect(page.locator('main h1')).toContainText('Empire —')
  return purchases
}

/** Fixture mutations stand in for authoritative changes; trigger the client's
 * foreground reconciliation instead of depending on an obsolete polling loop. */
export async function refreshGame(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

export async function playerProfilesFixture(
  page: Page,
  profiles: () => Array<{
    player: string
    username: string
    kind?: 'human' | 'bot'
    supporter_tier?: number
    observed_at?: number
    expires_at?: number
  }> | null,
) {
  await page.route(`**${boundApi(1, 'player-profiles')}`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const { context, source } = route.request().postDataJSON()
    if (!matchesFixtureContext(context)) return route.fallback()
    // These prepared observations cover the owned account, the requested
    // rankings players, or the installed home system. Other sources use the
    // game's empty observation or a more specific scenario handler.
    const matches = (player: { player: string }) => {
      if (source.type === 'SelfAccount') return player.player === binding.player
      if (source.type === 'Rankings')
        return source.players.includes(player.player)
      return true
    }
    if (
      !(
        source?.type === 'SelfAccount' ||
        (source?.type === 'Rankings' && Array.isArray(source.players)) ||
        (source?.type === 'Galaxy' &&
          source.galaxy === body.coordinates.galaxy &&
          source.system === body.coordinates.system)
      )
    )
      return route.fallback()
    const players = profiles()
    if (players === null) return route.fulfill({ status: 503 })
    const now = Math.floor(Date.now() / 1000)
    await route.fulfill({
      json: {
        binding: context.binding,
        request_id: context.request_id,
        players: players.filter(matches).map((p) => ({
          observed_at: now,
          expires_at: now + 300,
          ...p,
        })),
      },
    })
  })
}
