import { readyFixture, id } from '../../src/test-support/bootstrap'
import { productionFixture } from '../../src/test-support/production'
import { progressionFixture } from '../../src/features/progression/progression-test-fixture'
import { Coordinator } from '../../src/client-model/coordinator'
import type {
  BoundProgressionOptions,
  GamePort,
  QueryContext,
  Envelope,
  BoundReceipt,
} from '../../src/client-model/commands'
import type { components } from '../../src/contracts'
import rules from '../../../../rules/mvp-v1-slice-9.json'
import lockedRules from '../../../../rules/mvp-v1-slice-5.json'
type S = components['schemas']
const epoch = Date.UTC(2026, 10, 9, 12)
export async function createResourceScene(params: URLSearchParams) {
  const protocol: 3 | 4 = params.get('protocol') === '3' ? 3 : 4
  const { session, snapshot } = readyFixture(protocol)
  if (snapshot.view.protocol === 2)
    throw Error('Modern progression fixture required')
  const view = snapshot.view
  const body = structuredClone(progressionFixture().view.bodies[0])
  body.id = id(5)
  body.levels.DeuteriumSynthesizer = 0
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
      gross_per_hour: { metal: '0', crystal: '0', deuterium: '10000000' },
      net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '10000000' },
    },
  ]
  view.viewer_revision = '1'
  view.sampled_at = view.as_of_ms = epoch
  snapshot.candidate.sampled_at = epoch
  view.catalog = structuredClone(rules.catalog) as S['CatalogEntry3'][]
  view.research = [{ research: 'CombustionDrive', level: 10 }]
  const mode = params.get('mode')
  if (mode === 'poor') body.amounts.metal = '0'
  if (mode === 'building') {
    view.catalog = [
      'MetalStorage',
      'CrystalMine',
      'MetalMine',
      'ResearchLab',
    ].map((id) => ({
      key: { kind: 'Building', id: id as S['BuildingId3'] },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    }))
    body.levels.ResearchLab = 0
    body.amounts = {
      metal: '1000000000',
      crystal: '1000000000',
      deuterium: '182999999',
    }
    body.energy = {
      supply: '48400000',
      demand: '22000000',
      utilization: '1000000',
    }
    view.progression.production = [productionFixture(body)]
  }
  if (mode === 'unavailable')
    view.catalog = structuredClone(lockedRules.catalog) as S['CatalogEntry3'][]
  if (mode === 'research') {
    view.catalog = [
      {
        key: { kind: 'Research', id: 'EnergyTechnology' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ]
    view.research = [{ research: 'EnergyTechnology', level: 1 }]
    body.amounts.metal = '59999999'
  }
  const sent: Envelope[] = []
  let rejected = false
  let held: Promise<void> | null = null
  let release = () => {}
  let failInspection = mode === 'failed'
  let optionsRelease = () => {}
  let optionsGate: Promise<void> | null =
    mode === 'loading'
      ? new Promise((resolve) => {
          optionsRelease = resolve
        })
      : null
  let queries = 0
  const requests: S['QuoteRequest3'][] = []
  const paid =
    mode === 'costs'
      ? { metal: '10000000000', crystal: '6000000000', deuterium: '2000000000' }
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
        building: (params.get('item') ?? 'MetalMine') as S['BuildingId3'],
        target_level:
          (body.levels[
            (params.get('item') ?? 'MetalMine') as S['BuildingId3']
          ] ?? 0) + 1,
        started_at: epoch - Number(params.get('elapsed') ?? 30000),
        paid,
        due_at: epoch + 76000,
      },
    ]
  if (params.get('page') === 'research' && mode === 'active') {
    view.constructions = []
    view.progression.research_operation = {
      id: id(20),
      host: body.id,
      research: 'EnergyTechnology',
      source_level: 1,
      target_level: 2,
      started_at: epoch - 30000,
      due_at: epoch + 3600000,
      paid,
      labs: [],
      effective_lab: '1',
      can_cancel: true,
    }
    view.research = [{ research: 'EnergyTechnology', level: 1 }]
  }
  if (params.get('active') === 'storage')
    view.constructions = [
      {
        id: id(20),
        body: body.id,
        building: 'MetalStorage',
        target_level: 1,
        started_at: epoch - 30000,
        due_at: epoch + 76000,
        paid,
      },
    ]
  const forecast = params.get('forecast')
  if (forecast) {
    view.catalog = [
      {
        key: {
          kind: 'Building',
          id: forecast.startsWith('fusion') ? 'FusionReactor' : 'CrystalMine',
        },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ]
    const limited = forecast === 'fusion-fuel-limited'
    body.capacity = {
      metal: '100000000000',
      crystal: '100000000000',
      deuterium: '100000000000',
    }
    body.levels.FusionReactor = 0
    body.levels.CrystalMine = 13
    body.amounts = {
      metal: '50000000000',
      crystal: '50000000000',
      deuterium: limited ? '0' : '10000000000',
    }
    body.energy = {
      supply: '1840000000',
      demand: '1874000000',
      utilization: '981856',
    }
    view.progression.production[0] = {
      ...productionFixture(body),
      settings: {
        ...productionFixture(body).settings,
        fusion_reactor: limited ? 50 : 100,
      },
      gross_per_hour: {
        metal: '1000000000',
        crystal: '2689000000',
        deuterium: '8000000',
      },
      net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '8000000' },
      editable: [],
    }
    if (!forecast.startsWith('fusion'))
      view.constructions = [
        {
          id: id(20),
          body: body.id,
          building: 'CrystalMine',
          target_level: forecast === 'crystal-demolition' ? 12 : 14,
          started_at: epoch - 30000,
          due_at: epoch + 3000000,
          paid: {
            metal: '21617000000',
            crystal: '10808000000',
            deuterium: '0',
          },
        },
      ]
  }
  let sequence = 100
  const metadata = (context: QueryContext) => ({
    protocol,
    binding: view.binding,
    request_id: context.request_id,
    viewer_revision: view.viewer_revision,
    sampled_at: epoch,
    as_of_ms: epoch,
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
      queries++
      requests.push(request)
      if (failInspection) throw Error('Deliberately unavailable inspection')
      if (optionsGate) await optionsGate
      if (request.type === 'Transport')
        throw Error('Unexpected transport in progression component')
      if (
        forecast &&
        (request.type === 'Upgrade' || request.type === 'Demolition')
      ) {
        const fusion = forecast.startsWith('fusion')
        const limited = forecast === 'fusion-fuel-limited'
        const demolition = forecast === 'crystal-demolition'
        const building = fusion ? 'FusionReactor' : 'CrystalMine'
        const current = {
          energy_supply: '1840000000',
          energy_demand: '1874000000',
          utilization: '981856',
          fusion_supply: '0',
          fuel_deuterium_per_hour: '0',
          fuel_utilization: '1000000',
          net_deuterium_per_hour: '8000000',
          metal_per_hour: '1000000000',
          crystal_per_hour: '2689000000',
        }
        const response: S['BoundProgressionOptions4'] = {
          protocol: 4,
          binding: view.binding,
          request_id: context.request_id,
          viewer_revision: view.viewer_revision,
          sampled_at: epoch,
          as_of_ms: epoch,
          request,
          terms_hash: 'b'.repeat(64),
          estimates: null,
          blockers: view.constructions.length
            ? [
                {
                  code: 'ActiveConstruction',
                  requirement: null,
                  required: null,
                  actual: null,
                  resource: null,
                  unit: null,
                },
              ]
            : [],
          terms: {
            type: 'Building',
            profile_hash: 'a'.repeat(64),
            body: body.id,
            building,
            action: request.type,
            source_level: body.levels[building]!,
            target_level:
              body.levels[building]! + (request.type === 'Demolition' ? -1 : 1),
            paid: {
              metal: '900000000',
              crystal: '360000000',
              deuterium: '180000000',
            },
            duration_ms: 30000,
            formula: 'BuildingRedesign2011',
            facilities: [],
            required_energy: '0',
            reserve_fields: 1,
          },
          building_benefit: fusion
            ? { kind: 'Energy', current: '0', target: '32000000' }
            : {
                kind: 'CrystalPerHour',
                current: '2700000000',
                target: '3300000000',
              },
          building_energy: {
            current_consumption: fusion ? '0' : '100000000',
            target_consumption: fusion
              ? '0'
              : demolition
                ? '70000000'
                : '183000000',
          },
          building_production: {
            current,
            target: {
              ...current,
              energy_supply: fusion
                ? limited
                  ? '1848000000'
                  : '1872000000'
                : '1840000000',
              energy_demand: fusion
                ? '1874000000'
                : demolition
                  ? '1844000000'
                  : '1957000000',
              utilization: fusion
                ? limited
                  ? '986125'
                  : '998932'
                : demolition
                  ? '997830'
                  : '940214',
              crystal_per_hour: fusion
                ? '2689000000'
                : demolition
                  ? '2400000000'
                  : '3045000000',
              fusion_supply: fusion ? (limited ? '8000000' : '32000000') : '0',
              fuel_deuterium_per_hour: fusion
                ? limited
                  ? '8000000'
                  : '33000000'
                : '0',
              fuel_utilization: limited ? '500000' : '1000000',
            },
          },
        }

        return response
      }
      const common = {
        profile_hash: view.profile_hash,
        paid:
          mode === 'building'
            ? {
                metal: '200000000',
                crystal: '400000000',
                deuterium:
                  'building' in request && request.building === 'ResearchLab'
                    ? '200000000'
                    : '0',
              }
            : paid,
      }
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
                paid:
                  mode === 'research' && (view.research[0]?.level ?? 0) > 1
                    ? { ...paid, metal: '120000000' }
                    : common.paid,
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
        ...(mode === 'building' && 'building' in request
          ? {
              building_benefit:
                request.building === 'MetalStorage'
                  ? {
                      kind: 'MetalCapacity' as const,
                      current: '10000000000',
                      target: '20000000000',
                    }
                  : request.building === 'CrystalMine'
                    ? {
                        kind: 'CrystalPerHour' as const,
                        current: '22000000',
                        target:
                          request.type === 'Demolition' ? '0' : '48400000',
                      }
                    : undefined,
              building_energy: {
                current_consumption:
                  request.building === 'CrystalMine' ? '11000000' : '0',
                target_consumption:
                  request.building === 'CrystalMine'
                    ? request.type === 'Demolition'
                      ? '0'
                      : '24200000'
                    : '0',
              },
            }
          : {}),
        terms,
        terms_hash: 'b'.repeat(64),
        blockers:
          mode === 'blocked' || view.constructions.length > 0
            ? [
                {
                  code:
                    mode === 'blocked' ? 'NoFreeField' : 'ActiveConstruction',
                  requirement: null,
                  required: null,
                  actual: null,
                  resource: null,
                  unit: null,
                },
              ]
            : [],
        estimates: null,
      }
    },
    submit: async (envelope): Promise<BoundReceipt> => {
      sent.push(envelope)
      if (held) await held
      const command = envelope.command
      if (rejected)
        return {
          protocol,
          binding: view.binding,
          command_id: envelope.command_id,
          admitted_at: epoch,
          executed_at: epoch,
          status: 'Rejected',
          code: 'InsufficientResources',
        }
      if (command.type === 'SetProduction') {
        const production = view.progression.production[0]
        production.settings = command.settings
        production.settings_revision = String(
          Number(production.settings_revision) + 1,
        )
      } else if (command.type === 'StartUpgrade') {
        view.constructions.push({
          id: id(90),
          body: command.body,
          building: command.building,
          target_level: (body.levels[command.building] ?? 0) + 1,
          started_at: epoch,
          due_at: epoch + 76000,
          paid,
        })
      } else if (command.type === 'CancelConstruction') view.constructions = []
      else throw Error(`Unexpected resource command ${command.type}`)
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      return {
        protocol,
        binding: view.binding,
        command_id: envelope.command_id,
        admitted_at: epoch,
        executed_at: epoch,
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
    },
    receipt: async () => {
      throw Error('Presentation component unexpectedly requested a receipt')
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
      monotonicNowMs: () => 0,
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
    queries: () => queries,
    failInspection: (value: boolean) => {
      failInspection = value
    },
    releaseOptions: () => {
      optionsGate = null
      optionsRelease()
    },
    reject: (value: boolean) => {
      rejected = value
    },
    hold: () => {
      held = new Promise<void>((resolve) => {
        release = resolve
      })
    },
    release: () => {
      held = null
      release()
    },
    refresh: async () => {
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      await model.refresh()
    },
  }
}
