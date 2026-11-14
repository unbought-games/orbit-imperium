import { simulationCatalog } from '../fixtures/simulation-catalog'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { productionFixture } from '../../src/test-support/production'
import {
  deferred,
  progressionFixture,
} from '../../src/features/progression/progression-test-fixture'
import { Coordinator } from '../../src/client-model/coordinator'
import type { components } from '../../src/contracts'
import { shipProfile, type ProfileShip } from './ship-profiles'
import rules from '../../../../rules/mvp-v1-slice-9.json'
import type {
  BoundProgressionOptions,
  GamePort,
  QueryContext,
  BoundReceipt,
  Envelope,
} from '../../src/client-model/commands'

type S = components['schemas']
const epoch = Date.UTC(2026, 10, 9, 12)

export const shipStatistics: S['ShipStatistics3'] = {
  propulsion: {
    cargo_capacity: '7654',
    base_speed: '4321',
    fuel_consumption: '17',
    drive: 'CombustionDrive',
    impulse_upgrade: {
      minimum_level: 8,
      base_speed: '9876',
      fuel_consumption: '33',
    },
  },
  combat: {
    attack_ticks: '1234000',
    shield_ticks: '5678000',
    hull_ticks: '80000000',
    rapid_fire_against: [
      { unit: { kind: 'Ship', id: 'EspionageProbe' }, factor: '5' },
    ],
    rapid_fire_from: [],
  },
}

/** Controlled transport data only. The real Coordinator, selectors and detail
 * hooks own projection, inspection, eligibility and rendering. No API client. */
export async function createProgressionScene(params: URLSearchParams) {
  const protocol: 3 | 4 = params.get('protocol') === '3' ? 3 : 4
  const { session, snapshot } = readyFixture(protocol)
  if (snapshot.view.protocol === 2)
    throw Error('Modern progression fixture required')
  const view = snapshot.view
  const body = structuredClone(progressionFixture().view.bodies[0])
  body.id = id(5)
  body.amounts = {
    metal: '6661686240',
    crystal: '9420339537',
    deuterium: '3122000000',
  }
  body.capacity = {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  }
  body.inventories = [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' }]
  view.bodies = [body]
  view.progression.production = [
    {
      ...productionFixture(body),
      gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
    },
  ]
  view.viewer_revision = '1'
  view.sampled_at = view.as_of_ms = epoch
  snapshot.candidate.sampled_at = epoch
  view.catalog = structuredClone(rules.catalog) as S['CatalogEntry3'][]
  view.research = [{ research: 'CombustionDrive', level: 10 }]
  const mode = params.get('mode')
  const orderMode = mode === 'order' || mode === 'defense-content'
  const sent: Envelope[] = []
  const requests: S['QuoteRequest3'][] = []
  const loading = params.get('loading') === 'yes' ? deferred<void>() : null
  let commandGate: ReturnType<typeof deferred<void>> | null = null
  let outcome: 'Committed' | 'Pending' | 'Rejected' | 'uncertain' = 'Committed'
  let metalCost = params.get('metalCost')
  let recovery: BoundReceipt | null = null
  let elapsed = 0
  if (orderMode) {
    body.amounts = {
      metal: params.get('metal') ?? '12226000000',
      crystal: '12000000000',
      deuterium: '0',
    }
    body.capacity = {
      metal: '30000000000',
      crystal: '30000000000',
      deuterium: '0',
    }
    if (params.get('income') === 'yes') {
      view.progression.production[0].gross_per_hour.metal = '3600000000'
      view.progress = {
        sampled_at: epoch,
        scopes: [],
        minimum_revision_pending: false,
        projection_limit: null,
        command_references: false,
      }
    }
  }
  if (mode === 'profile') {
    const item = params.get('item') as ProfileShip
    view.catalog = view.catalog.map((entry) =>
      entry.key.id === item ? shipProfile(item) : entry,
    )
  }
  if (mode === 'battleship') {
    const gate = params.get('gate')
    const entry = shipProfile('Battleship')
    entry.enabled = gate !== 'disabled'
    view.catalog = view.catalog.map((candidate) =>
      candidate.key.id === 'Battleship' ? entry : candidate,
    )
    body.levels.Shipyard = gate === 'Shipyard' ? 6 : 7
    view.research = [
      {
        research: 'HyperspaceDrive',
        level: gate === 'HyperspaceDrive' ? 3 : 4,
      },
    ]
  }
  if (mode === 'defense-content') {
    const item = params.get('item')
    if (item !== 'IonCannon') throw Error('Unknown defense specimen')
    view.catalog = view.catalog.map((entry) =>
      entry.key.id === item
        ? {
            ...entry,
            enabled: true,
            requirements: [
              { type: 'BodyBuilding', building: 'Shipyard', level: 4 },
              { type: 'PlayerResearch', research: 'IonTechnology', level: 4 },
            ],
          }
        : entry,
    )
    body.levels.Shipyard = 4
    view.research = [{ research: 'IonTechnology', level: 4 }]
    body.amounts = {
      metal: '100000000000',
      crystal: '100000000000',
      deuterium: '0',
    }
    body.capacity = { ...body.amounts }
    body.inventories = [{ item: { kind: 'Defense', id: item }, count: '7' }]
  }
  if (mode === 'technical') {
    view.catalog = view.catalog.map((entry) => {
      const empty = {
        facts: [],
        bonuses: [],
        combat: null,
        storage_capacities: null,
      }
      switch (entry.key.id) {
        case 'RoboticsFactory':
          return {
            ...entry,
            technical_data: {
              ...empty,
              facts: [
                {
                  label: 'Construction time',
                  value:
                    'The raw construction duration is divided by (1 + Robotics Factory level).',
                  subject: null,
                },
              ],
            },
          }
        case 'CombustionDrive':
          return {
            ...entry,
            technical_data: {
              ...empty,
              bonuses: [
                {
                  label: 'Base speed',
                  fraction: ['3', '20'],
                  subject: { kind: 'Ship', id: 'SmallCargo' },
                  condition: 'Replaced when Impulse Drive reaches level 8.',
                },
              ],
            },
          }
        case 'RocketLauncher':
          return {
            ...entry,
            technical_data: {
              ...empty,
              combat: {
                attack_ticks: '8000000',
                shield_ticks: '2000000',
                hull_ticks: '20000000',
                rapid_fire_against: [],
                rapid_fire_from: [
                  { unit: { kind: 'Ship', id: 'Cruiser' }, factor: '10' },
                ],
              },
              facts: [
                {
                  label: 'Recovery after combat',
                  value:
                    '7 / 10 chance for each destroyed defense to recover independently.',
                  subject: null,
                },
              ],
            },
          }
        case 'SmallCargo':
          return {
            ...entry,
            requirements: [
              { type: 'PlayerResearch', research: 'CombustionDrive', level: 6 },
            ],
          }
        default:
          return entry
      }
    })
  }
  if (mode === 'progress') {
    const item = params.get('item')
    const duration = Number(params.get('duration') ?? 5760000)
    view.progress = {
      sampled_at: epoch,
      scopes: [],
      minimum_revision_pending: false,
      projection_limit: null,
      command_references: false,
    }
    if (item === 'ImpulseDrive') {
      view.research = [{ research: 'ImpulseDrive', level: 4 }]
      view.progression.research_operation = {
        id: id(20),
        host: body.id,
        research: 'ImpulseDrive',
        source_level: 4,
        target_level: 5,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
        started_at: epoch,
        due_at: epoch + duration,
        labs: [],
        effective_lab: '1',
        can_cancel: true,
      }
    } else {
      if (item !== 'CrystalMine' && item !== 'ResearchLab')
        throw Error('Unknown progress specimen')
      body.levels[item] = 4
      view.constructions = [
        {
          id: id(21),
          body: body.id,
          building: item,
          target_level: 5,
          due_at: epoch + duration,
          paid: { metal: '0', crystal: '0', deuterium: '0' },
        },
      ]
    }
  }
  const defaultPaid =
    mode === 'defense-content'
      ? { metal: '2000000000', crystal: '6000000000', deuterium: '0' }
      : mode === 'costs'
        ? {
            metal: '10000000000',
            crystal: '6000000000',
            deuterium: '2000000000',
          }
        : mode === 'ledger'
          ? { metal: '9007199254740993', crystal: '15000000', deuterium: '0' }
          : { metal: '60000000', crystal: '15000000', deuterium: '0' }
  if (mode === 'ledger')
    body.amounts.metal = body.amounts.crystal = '9007199254740993'
  if (mode === 'inventory') {
    body.amounts.metal = '60000001'
    body.inventories = [
      { item: { kind: 'Ship', id: 'SmallCargo' }, count: '9007199254740993' },
    ]
  }
  if (mode === 'active')
    view.constructions = [
      {
        id: id(20),
        body: body.id,
        building: 'RoboticsFactory',
        target_level: 1,
        paid: defaultPaid,
        due_at: epoch + 76000,
      },
    ]
  if (mode === 'stats' || mode === 'legacy') {
    const cargo = view.catalog.find((entry) => entry.key.id === 'SmallCargo')!
    if (mode === 'stats') cargo.ship_statistics = shipStatistics
    else delete cargo.ship_statistics
  }
  if (mode === 'ship-order') view.catalog = structuredClone(simulationCatalog)
  let sequence = 100
  const metadata = (context: QueryContext) => ({
    protocol,
    binding: view.binding,
    request_id: context.request_id,
    viewer_revision: view.viewer_revision,
    sampled_at: epoch + elapsed,
    as_of_ms: epoch + elapsed,
  })
  const port: GamePort = {
    currentBinding: async (_universe, request_id) => ({
      ...snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({
      ...snapshot.settings,
      request_id: context.request_id,
    }),
    view: async (context) =>
      structuredClone({ ...view, request_id: context.request_id }),
    quote: async () => {
      throw Error('Unexpected legacy quote in progression component')
    },
    progressionOptions: async (
      context,
      request,
    ): Promise<BoundProgressionOptions> => {
      if (mode === 'active')
        throw Error('Deliberately unavailable active-work forecast')
      if (request.type === 'Transport')
        throw Error('Unexpected transport in progression component')
      requests.push(request)
      if (loading) await loading.promise
      const paid =
        metalCost === null
          ? defaultPaid
          : { metal: metalCost, crystal: '0', deuterium: '0' }
      const common = { profile_hash: view.profile_hash, paid }
      const terms: NonNullable<BoundProgressionOptions['terms']> =
        request.type === 'Manufacture'
          ? {
              ...common,
              type: 'Manufacture',
              body: request.body,
              item: request.item,
              quantity: request.quantity,
              unit_cost: paid,
              paid: {
                metal: (
                  BigInt(paid.metal) * BigInt(request.quantity)
                ).toString(),
                crystal: (
                  BigInt(paid.crystal) * BigInt(request.quantity)
                ).toString(),
                deuterium: (
                  BigInt(paid.deuterium) * BigInt(request.quantity)
                ).toString(),
              },
              unit_duration_ms: 30000,
              formula: 'ManufactureClassic',
              facilities: [],
            }
          : request.type === 'Research'
            ? {
                ...common,
                type: 'Research',
                host: request.host,
                research: request.research,
                source_level:
                  view.research.find((r) => r.research === request.research)
                    ?.level ?? 0,
                target_level:
                  (view.research.find((r) => r.research === request.research)
                    ?.level ?? 0) + 1,
                duration_ms: 60000,
                formula: 'ResearchClassic',
                labs: [],
                effective_lab: '1',
                required_energy: '0',
              }
            : {
                ...common,
                type: 'Building',
                body: request.body,
                building: request.building,
                action: request.type,
                source_level:
                  body.levels[request.building as keyof typeof body.levels] ??
                  0,
                target_level:
                  (body.levels[request.building as keyof typeof body.levels] ??
                    0) + (request.type === 'Upgrade' ? 1 : -1),
                duration_ms: 76000,
                formula: 'BuildingRedesign2011',
                facilities: [],
                required_energy: '0',
                reserve_fields: 1,
              }
      return {
        ...metadata(context),
        request,
        terms,
        terms_hash: 'b'.repeat(64),
        blockers:
          mode === 'blocked'
            ? [
                {
                  code: 'NoFreeField',
                  requirement: null,
                  required: null,
                  actual: null,
                  resource: null,
                  unit: null,
                },
              ]
            : mode === 'battleship' &&
                request.type === 'Manufacture' &&
                request.item.id === 'Battleship'
              ? view.catalog
                  .find((entry) => entry.key.id === 'Battleship')!
                  .requirements.flatMap((requirement) => {
                    const actual =
                      requirement.type === 'BodyBuilding'
                        ? (body.levels[requirement.building] ?? 0)
                        : (view.research.find(
                            (entry) => entry.research === requirement.research,
                          )?.level ?? 0)
                    return actual < requirement.level
                      ? [
                          {
                            code: 'PrerequisiteMissing' as const,
                            requirement,
                            required: String(requirement.level),
                            actual: String(actual),
                            resource: null,
                            unit: null,
                          },
                        ]
                      : []
                  })
              : [],
        estimates: null,
      }
    },
    submit: async (envelope): Promise<BoundReceipt> => {
      const { command, command_id } = envelope
      if (!orderMode || command.type !== 'StartManufacture')
        throw Error(`Unexpected progression command ${command.type}`)
      sent.push(envelope)
      if (commandGate) await commandGate.promise
      const identity = {
        protocol,
        binding: view.binding,
        command_id,
        admitted_at: epoch + elapsed,
      }
      if (outcome === 'Pending')
        return { ...identity, status: 'Pending', executed_at: null }
      if (outcome === 'Rejected')
        return {
          ...identity,
          status: 'Rejected',
          executed_at: epoch + elapsed,
          code: 'InsufficientResources',
        }
      // Transport fixture returns an authoritative balance and revision; the
      // Coordinator still owns reservations, reconciliation and presentation.
      const unit = BigInt(metalCost ?? defaultPaid.metal)
      const balance =
        BigInt(body.amounts.metal) +
        (BigInt(epoch + elapsed - view.sampled_at) *
          BigInt(view.progression.production[0].gross_per_hour.metal)) /
          3600000n
      body.amounts.metal = (
        balance -
        unit * BigInt(command.quantity)
      ).toString()
      if (metalCost === null) {
        for (const resource of ['crystal', 'deuterium'] as const)
          body.amounts[resource] = (
            BigInt(body.amounts[resource]) -
            BigInt(defaultPaid[resource]) * BigInt(command.quantity)
          ).toString()
      }
      view.sampled_at = view.as_of_ms = epoch + elapsed
      view.viewer_revision = String(BigInt(view.viewer_revision) + 1n)
      const committed: BoundReceipt = {
        ...identity,
        status: 'Committed',
        executed_at: epoch + elapsed,
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
      recovery = committed
      if (outcome === 'uncertain')
        throw Error('Connection lost after admission')
      return committed
    },
    receipt: async (_binding, commandId) => {
      if (!recovery || recovery.command_id !== commandId)
        throw Error('Unexpected progression receipt request')
      return recovery
    },
  }
  const model = new Coordinator(
    port,
    {
      load: async () => [],
      put: async () => {},
      remove: async () => {},
      clear: async () => {},
    },
    {
      newId: () => id(sequence++),
      monotonicNowMs: () => elapsed,
      isOnline: () => true,
    },
    false,
  )
  await model.initialize(structuredClone(session), structuredClone(snapshot))
  return {
    model,
    view,
    sent,
    requests,
    releaseOptions: () => loading?.resolve(),
    setMetalCost: (value: string) => {
      metalCost = value
    },
    holdOrder: () => {
      commandGate = deferred<void>()
    },
    finishOrder: (status: typeof outcome) => {
      outcome = status
      commandGate?.resolve()
      commandGate = null
    },
    tick: (milliseconds: number) => {
      elapsed += milliseconds
      model.tick()
    },
    refresh: async () => {
      view.viewer_revision = String(BigInt(view.viewer_revision) + 1n)
      await model.refresh()
    },
  }
}
