import type { components } from '../contracts'
import { readyFixture, id } from '../test-support/bootstrap'
import { completePreviewWork } from './detail-preview-completion'
import { Coordinator } from '../client-model/coordinator'
import type {
  BoundProgressionOptions,
  GamePort,
  QuoteRequest,
} from '../client-model/commands'
import { manufacturingPreview } from '../features/progression/manufacturing-preview'
import { resourceShortfalls } from '../client-model/resources'
import rules from '../../../../rules/mvp-v1-slice-9.json'

type S = components['schemas']
export const scenes = [
  {
    id: 'mine-zero',
    title: 'Metal Mine · first build (level 0)',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'mine-ready',
    title: 'Metal Mine · ready',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'mine-energy',
    title: 'Metal Mine · energy deficit',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'mine-short',
    title: 'Metal Mine · resources missing',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'mine-busy',
    title: 'Metal Mine · construction slot busy',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'mine-active',
    title: 'Metal Mine · upgrade in progress',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'storage-full',
    title: 'Metal Storage · full',
    category: 'Buildings',
    item: 'MetalStorage',
  },
  {
    id: 'solar-ready',
    title: 'Solar Plant · power improvement',
    category: 'Buildings',
    item: 'SolarPlant',
  },
  {
    id: 'facility-locked',
    title: 'Research Lab · missing prerequisite',
    category: 'Buildings',
    item: 'ResearchLab',
  },
  {
    id: 'research-ready',
    title: 'Combustion Drive · ready',
    category: 'Research',
    item: 'CombustionDrive',
  },
  {
    id: 'research-active',
    title: 'Combustion Drive · researching',
    category: 'Research',
    item: 'CombustionDrive',
  },
  {
    id: 'ship-ready',
    title: 'Small Cargo · order a batch',
    category: 'Ships & defenses',
    item: 'SmallCargo',
  },
  {
    id: 'defense-queued',
    title: 'Rocket Launcher · queue occupied',
    category: 'Ships & defenses',
    item: 'RocketLauncher',
  },
  {
    id: 'mine-capacity',
    title: 'Metal Mine · storage limited',
    category: 'Buildings',
    item: 'MetalMine',
  },
  {
    id: 'research-capacity',
    title: 'Combustion Drive · storage limited',
    category: 'Research',
    item: 'CombustionDrive',
  },
  {
    id: 'ship-capacity',
    title: 'Small Cargo · storage limited',
    category: 'Ships & defenses',
    item: 'SmallCargo',
  },
] as const
export type SceneId = (typeof scenes)[number]['id']
const scaled = (n: number) => String(n * 1000000)
const resources = (metal: number, crystal: number, deuterium = 0) => ({
  metal: scaled(metal),
  crystal: scaled(crystal),
  deuterium: scaled(deuterium),
})
const blocker = (code: S['GameError3']): S['ProgressionBlocker'] => ({
  code,
  required: null,
  actual: null,
  resource: null,
  unit: null,
  requirement: null,
})

/** In-memory server fixture. No HTTP, cookies, or persistent game storage. */
export async function createDetailPreview(
  sceneId: SceneId,
  onAction: (message: string) => void,
) {
  const scene = scenes.find((entry) => entry.id === sceneId) ?? scenes[0]
  const { session, snapshot } = readyFixture(3)
  const view = snapshot.view as S['BoundView3']
  const now = Date.now()
  view.sampled_at = view.as_of_ms = now
  snapshot.candidate.sampled_at = now
  view.viewer_revision = '1'
  view.catalog = structuredClone(rules.catalog) as S['CatalogEntry3'][]
  const body: S['BodyV3'] = {
    id: id(6),
    name: 'New Horizon',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 37, position: 8 },
    amounts: resources(7200, 4200, 1800),
    capacity: resources(10000, 10000, 10000),
    levels: {
      MetalMine: 4,
      CrystalMine: 3,
      DeuteriumSynthesizer: 2,
      SolarPlant: 8,
      MetalStorage: 0,
      CrystalStorage: 0,
      DeuteriumTank: 0,
      RoboticsFactory: 3,
      ResearchLab: 2,
      Shipyard: 2,
    },
    energy: {
      supply: scaled(sceneId === 'mine-energy' ? 145 : 200),
      demand: scaled(135),
      utilization: '1000000',
    },
    fields: 163,
    fields_used: 30,
    fields_reserved: 0,
    inventories: [
      { item: { kind: 'Ship', id: 'SmallCargo' }, count: '12' },
      { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '8' },
    ],
  }
  if (sceneId === 'mine-zero') {
    body.levels = Object.fromEntries(
      Object.keys(body.levels).map((key) => [key, 0]),
    ) as typeof body.levels
    body.amounts = resources(500, 500)
    body.inventories = []
    body.fields_used = 0
    body.energy = { supply: '0', demand: '0', utilization: '1000000' }
  }
  if (sceneId.endsWith('-capacity')) {
    body.amounts = resources(0, 0, 0)
    body.capacity = resources(100, 50, 100)
  }
  if (sceneId === 'mine-short') body.amounts = resources(120, 20, 40)
  if (sceneId === 'storage-full') {
    body.levels.MetalStorage = 1
    body.capacity.metal = scaled(20000)
    body.amounts.metal = scaled(20000)
  }
  view.bodies = [body]
  view.research = [
    { research: 'EnergyTechnology', level: 3 },
    { research: 'CombustionDrive', level: 2 },
  ]
  if (sceneId === 'mine-zero') view.research = []
  view.capabilities = (
    [
      'Construction',
      'Research',
      'Manufacturing',
      'Production',
      'Demolition',
    ] as const
  ).map((capability) => ({ capability, enabled: true, reason: 'Available' }))
  view.progression.production = [
    {
      body: body.id,
      settings_revision: '1',
      settings: {
        metal_mine: 100,
        crystal_mine: 100,
        deuterium_synthesizer: 100,
        solar_plant: 100,
        fusion_reactor: 100,
        solar_satellite: 100,
      },
      editable: [
        'metal_mine',
        'crystal_mine',
        'deuterium_synthesizer',
        'solar_plant',
      ],
      gross_per_hour:
        sceneId === 'mine-zero' ? resources(30, 15) : resources(908, 520, 160),
      fuel_deuterium_per_hour: '0',
      net_deuterium_per_hour: {
        sign: 'Nonnegative',
        magnitude: scaled(sceneId === 'mine-zero' ? 0 : 160),
      },
      energy_supply: body.energy.supply,
      energy_demand: body.energy.demand,
      utilization: '1000000',
      fuel_utilization: '1000000',
    },
  ]
  if (sceneId === 'mine-active' || sceneId === 'mine-busy')
    view.constructions = [
      {
        id: id(20),
        body: body.id,
        building: sceneId === 'mine-active' ? 'MetalMine' : 'RoboticsFactory',
        target_level: sceneId === 'mine-active' ? 5 : 4,
        paid: resources(303, 75),
        started_at: now - 60000,
        due_at: now + 74000,
      },
    ]
  if (sceneId === 'research-active')
    view.progression.research_operation = {
      id: id(21),
      host: body.id,
      research: 'CombustionDrive',
      source_level: 2,
      target_level: 3,
      paid: resources(1600, 0, 2400),
      started_at: now - 60000,
      due_at: now + 164000,
      labs: [],
      effective_lab: '2',
      can_cancel: true,
    }
  if (sceneId === 'defense-queued')
    view.progression.manufacturing = [
      {
        id: id(22),
        body: body.id,
        item: { kind: 'Ship', id: 'SmallCargo' },
        quantity: '3',
        completed_prefix: '0',
        remaining: '3',
        paid: resources(6000, 6000),
        accepted_at: now,
        first_start_at: now,
        next_due_at: now + 40000,
        final_due_at: now + 120000,
        unit_duration_ms: 40000,
        state: 'Producing',
        can_cancel: false,
      },
    ]
  if (sceneId === 'facility-locked') {
    body.levels.RoboticsFactory = 0
    const entry = view.catalog.find((entry) => entry.key.id === 'ResearchLab')!
    entry.requirements = [
      { type: 'BodyBuilding', building: 'RoboticsFactory', level: 2 },
    ]
  }
  const entry = view.catalog.find((entry) => entry.key.id === scene.item)!
  const receipts = new Map<string, S['BoundReceipt3']>()
  function inspect(
    request: QuoteRequest,
    requestId = id(10),
  ): BoundProgressionOptions {
    if (request.type === 'Transport')
      throw Error('Transport is outside this preview.')
    const base = {
      protocol: 3 as const,
      binding: view.binding,
      request_id: requestId,
      viewer_revision: view.viewer_revision,
      sampled_at: Date.now(),
      as_of_ms: Date.now(),
      request,
      terms_hash: 'b'.repeat(64),
      blockers: [] as S['ProgressionBlocker'][],
      estimates: null,
    }
    if (request.type === 'Upgrade' || request.type === 'Demolition') {
      const level =
        body.levels[request.building as keyof typeof body.levels] ?? 0
      const target =
        request.type === 'Demolition' ? Math.max(0, level - 1) : level + 1
      const paid =
        request.building === 'MetalStorage'
          ? resources(1000, 0)
          : level === 0 && request.building === 'MetalMine'
            ? resources(60, 15)
            : resources(303, 75)
      const result: S['BoundProgressionOptions'] = {
        ...base,
        terms: {
          type: 'Building',
          profile_hash: view.profile_hash,
          body: body.id,
          building: request.building,
          action: request.type,
          source_level: level,
          target_level: target,
          paid,
          duration_ms: 18000,
          formula: 'BuildingRedesign2011',
          facilities: [],
          required_energy: '0',
          reserve_fields: 1,
        },
        building_energy: {
          current_consumption: scaled(
            request.building === 'MetalMine' && level > 0 ? 64 : 0,
          ),
          target_consumption: scaled(
            request.building === 'MetalMine'
              ? level === 0
                ? 11
                : request.type === 'Demolition'
                  ? 49
                  : 85
              : 0,
          ),
        },
      }
      if (request.building === 'MetalMine')
        result.building_benefit = {
          kind: 'MetalPerHour',
          current: scaled(level === 0 ? 0 : 878),
          target: scaled(
            level === 0 ? 33 : request.type === 'Demolition' ? 620 : 1207,
          ),
        }
      if (request.building === 'MetalStorage')
        result.building_benefit = {
          kind: 'MetalCapacity',
          current: body.capacity.metal,
          target: (BigInt(body.capacity.metal) * 2n).toString(),
        }
      if (request.building === 'SolarPlant')
        result.building_benefit = {
          kind: 'Energy',
          current: scaled(200),
          target: scaled(270),
        }
      if (view.constructions.length)
        result.blockers.push(blocker('ActiveConstruction'))
      if (sceneId === 'facility-locked' && request.building === 'ResearchLab')
        result.blockers.push({
          ...blocker('PrerequisiteMissing'),
          requirement: {
            type: 'BodyBuilding',
            building: 'RoboticsFactory',
            level: 2,
          },
          required: '2',
          actual: '0',
          unit: 'Level',
        })
      result.blockers.push(
        ...resourceShortfalls(paid, body.amounts).map((short) => ({
          ...blocker('InsufficientResources'),
          required: short.required,
          actual: short.actual,
          resource: (short.name[0].toUpperCase() + short.name.slice(1)) as
            | 'Metal'
            | 'Crystal'
            | 'Deuterium',
          unit: 'MicroResource' as const,
        })),
      )
      return result
    }
    if (request.type === 'Research') {
      const level =
        view.research.find((entry) => entry.research === request.research)
          ?.level ?? 0
      return {
        ...base,
        terms: {
          type: 'Research',
          profile_hash: view.profile_hash,
          host: body.id,
          research: request.research,
          source_level: level,
          target_level: level + 1,
          paid: resources(1600, 0, 1200),
          duration_ms: 180000,
          formula: 'ResearchClassic',
          labs: [],
          effective_lab: '2',
          required_energy: '0',
        },
      }
    }
    if (request.type === 'Manufacture') {
      const source: S['BoundProgressionOptions'] = {
        ...base,
        terms: {
          type: 'Manufacture',
          profile_hash: view.profile_hash,
          body: body.id,
          item: request.item,
          quantity: '1',
          paid: resources(2000, 2000),
          unit_cost: resources(2000, 2000),
          unit_duration_ms: 40000,
          formula: 'ManufactureClassic',
          facilities: [],
        },
      }
      return {
        ...source,
        ...manufacturingPreview(source, view, request.quantity)!,
      }
    }
    throw Error('This preview supports item decisions only.')
  }
  const port: GamePort = {
    async currentBinding(_universe, request_id) {
      return { ...snapshot.candidate, request_id, sampled_at: Date.now() }
    },
    async settings(context) {
      return { ...snapshot.settings, request_id: context.request_id }
    },
    async view(context) {
      return structuredClone({
        ...view,
        request_id: context.request_id,
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
      })
    },
    async quote() {
      throw Error('Legacy quotes are not used in this preview.')
    },
    async progressionOptions(context, request) {
      return inspect(request, context.request_id)
    },
    async submit(envelope) {
      const command = envelope.command
      const commandId = envelope.command_id
      const existing = receipts.get(commandId)
      if (existing) return existing
      onAction(`Preview only: ${command.type}`)
      const transfer = (paid: S['Resources'], refund = false) => {
        for (const resource of ['metal', 'crystal', 'deuterium'] as const)
          body.amounts[resource] = (
            BigInt(body.amounts[resource]) +
            (refund ? 1n : -1n) * BigInt(paid[resource])
          ).toString()
      }
      if (
        command.type === 'StartUpgrade' ||
        command.type === 'StartDemolition'
      ) {
        const quote = inspect({
          type: command.type === 'StartUpgrade' ? 'Upgrade' : 'Demolition',
          body: body.id,
          building: command.building,
        })
        if (quote.terms?.type !== 'Building')
          throw Error('Missing preview construction terms')
        transfer(quote.terms.paid)
        view.constructions = [
          {
            id: id(25),
            body: body.id,
            building: command.building,
            target_level: quote.terms.target_level,
            paid: quote.terms.paid,
            due_at: Date.now() + quote.terms.duration_ms,
          },
        ]
      }
      if (command.type === 'CancelConstruction') {
        const work = view.constructions.find(
          (work) => work.id === command.operation,
        )
        if (work) transfer(work.paid, true)
        view.constructions = view.constructions.filter(
          (work) => work.id !== command.operation,
        )
      }
      if (command.type === 'CancelResearch') {
        const work = view.progression.research_operation
        if (work?.id === command.operation) {
          transfer(work.paid, true)
          view.progression.research_operation = null
        }
      }
      if (command.type === 'StartResearch') {
        const quote = inspect({
          type: 'Research',
          host: body.id,
          research: command.research,
        })
        if (quote.terms?.type !== 'Research')
          throw Error('Missing preview research terms')
        const { paid, source_level, target_level, duration_ms } = quote.terms
        transfer(paid)
        view.progression.research_operation = {
          id: id(26),
          host: body.id,
          research: command.research,
          source_level,
          target_level,
          paid,
          started_at: Date.now(),
          due_at: Date.now() + duration_ms,
          labs: [],
          effective_lab: '2',
          can_cancel: true,
        }
      }
      if (command.type === 'StartManufacture') {
        const quote = inspect({
          type: 'Manufacture',
          body: body.id,
          item: command.item,
          quantity: command.quantity,
        })
        if (quote.terms?.type !== 'Manufacture' || !quote.estimates)
          throw Error('Missing preview manufacturing terms')
        transfer(quote.terms.paid)
        view.progression.manufacturing.push({
          id: commandId,
          body: body.id,
          item: command.item,
          quantity: command.quantity,
          completed_prefix: '0',
          remaining: command.quantity,
          paid: quote.terms.paid,
          accepted_at: Date.now(),
          first_start_at: quote.estimates.first_start_at,
          next_due_at:
            quote.estimates.first_start_at + quote.terms.unit_duration_ms,
          final_due_at: quote.estimates.final_due_at,
          unit_duration_ms: quote.terms.unit_duration_ms,
          state:
            quote.estimates.first_start_at > Date.now()
              ? 'PaidQueued'
              : 'Producing',
          can_cancel: false,
        })
      }
      view.viewer_revision = String(BigInt(view.viewer_revision) + 1n)
      const receipt: S['BoundReceipt3'] = {
        protocol: 3,
        binding: view.binding,
        command_id: commandId,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
      receipts.set(commandId, receipt)
      return receipt
    },
    async receipt(_binding, commandId) {
      return receipts.get(commandId)!
    },
  }
  const model = new Coordinator(
    port,
    {
      async load() {
        return []
      },
      async put() {},
      async remove() {},
      async clear() {},
    },
    {
      newId: () => crypto.randomUUID(),
      monotonicNowMs: () => performance.now(),
      isOnline: () => true,
    },
    false,
  )
  await model.initialize(structuredClone(session), structuredClone(snapshot))
  return {
    model,
    scene,
    entry,
    inspect,
    async advance() {
      if (completePreviewWork(view, Date.now())) await model.refresh()
    },
  }
}
