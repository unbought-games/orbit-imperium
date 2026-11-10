import type { components } from '../../src/contracts'
import type {
  GamePort,
  WorldQuery,
  AttemptStorage,
} from '../../src/client-model/commands'
import { productionFixture } from '../../src/test-support/production'
import { Coordinator } from '../../src/client-model/coordinator'
import { readyFixture, id } from '../../src/test-support/bootstrap'

type S = components['schemas']
export { id }
export const now = Date.UTC(2026, 10, 9, 12)
export const originId = id(5)
export const colonyId = id(6)
export const player = id(2)
export const originBody: S['BodyV3'] = {
  id: originId,
  name: 'Aster Haven',
  kind: 'Planet',
  coordinates: { galaxy: 1, system: 371, position: 12 },
  amounts: {
    metal: '6661686240',
    crystal: '9420339537',
    deuterium: '3122000000',
  },
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
  fields_used: 0,
  fields_reserved: 0,
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  inventories: [
    { item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' },
    ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map((id) => ({
      item: { kind: 'Ship' as const, id },
      count: '1',
    })),
  ],
}
export type DispatchFixtureOptions = {
  blocker: S['GameError4'] | null
  estimateError: S['GameError4'] | null
  quoteError: S['GameError4'] | null
  observationAvailable: boolean
  debris: boolean
  fuel: string
  capacity: string
  maximumPayload: string
  duration: number
  profiles: boolean
}
export function dispatchData() {
  const ready = readyFixture(4)
  if (ready.snapshot.view.protocol !== 4) throw Error('Expected protocol 4')
  const view: S['BoundView4'] = {
    ...ready.snapshot.view,
    viewer_revision: '1',
    sampled_at: now,
    as_of_ms: now,
    homeworld_id: originId,
    bodies: [
      structuredClone(originBody),
      {
        ...structuredClone(originBody),
        id: colonyId,
        name: 'Haven Colony',
        coordinates: { galaxy: 1, system: 1, position: 2 },
        colony: {
          diameter_km: 12000,
          min_temperature: 0,
          max_temperature: 40,
          created_at: 1000,
          profile: 'oi-redesign-reconstructed-v1',
        },
      },
    ],
    player_names: { [player]: 'Commander' },
    research: [{ research: 'Astrophysics', level: 8 }],
    capabilities: (
      [
        'Transport',
        'Attack',
        'Espionage',
        'Harvest',
        'Deploy',
        'Reports',
        'Colonize',
        'Galaxy',
      ] as const
    ).map((capability) => ({ capability, enabled: true, reason: 'Available' })),
    catalog: (
      [
        'EspionageProbe',
        'Recycler',
        'ColonyShip',
        'SmallCargo',
        'LightFighter',
      ] as const
    ).map((id) => ({
      key: { kind: 'Ship', id },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
      ship_statistics: {
        propulsion: null,
        combat: null,
        cost: ['2000', '2000', '0'],
      },
    })),
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
  }
  view.progression.production = view.bodies.map(productionFixture)
  ready.snapshot.view = view
  ready.snapshot.candidate.sampled_at = now
  ready.snapshot.settings = {
    ...ready.snapshot.settings,
    galaxies: 1,
    systems_per_galaxy: 499,
  }
  const options: DispatchFixtureOptions = {
    blocker: null,
    quoteError: null,
    estimateError: null,
    observationAvailable: true,
    debris: true,
    duration: 100000,
    fuel: '1000000',
    capacity: '5000000000',
    maximumPayload: '4999000000',
    profiles: true,
  }
  return { ready, view, options }
}

/** External port fixtures only. All client request validation, projection and state transitions use Coordinator. */
export async function createDispatchFixture() {
  const data = dispatchData()
  let source = data.view
  const options = data.options
  const calls: WorldQuery[] = []
  const unexpected: string[] = []
  const gates = new Map<
    string,
    { promise: Promise<void>; release: () => void }
  >()
  const pending = new Set<Promise<unknown>>()
  const fail = (operation: string): never => {
    unexpected.push(operation)
    throw Error(`Unexpected Dispatch fixture operation: ${operation}`)
  }
  let sequence = 100
  let launches = 0
  const storage: AttemptStorage = {
    load: async () => [],
    put: async () => {},
    remove: async () => {},
    clear: async () => {},
  }
  const port: GamePort = {
    currentBinding: async (_universe, request_id) => ({
      ...data.ready.snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({
      ...data.ready.snapshot.settings,
      ...context,
    }),
    view: async (context) => ({ ...structuredClone(source), ...context }),
    quote: async () => fail('progression quote'),
    submit: async (envelope) => {
      if (
        envelope.command.type !== 'World' ||
        envelope.command.action.type !== 'LaunchFleet'
      )
        return fail('non-fleet command')
      launches++
      return {
        protocol: 4,
        binding: envelope.binding,
        command_id: envelope.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: source.viewer_revision,
      }
    },
    receipt: async () => fail('receipt polling'),
    world: async (context, query) => {
      calls.push(structuredClone(query))
      const work = (async (): Promise<S['BoundWorld4']> => {
        await gates.get(query.type)?.promise
        let result: S['BoundWorld4']['data']
        if (query.type === 'Galaxy') {
          result = {
            galaxy: query.galaxy,
            system: query.system,
            observed_at: now,
            player_names: { [id(30)]: 'Stargazer' },
            positions: Array.from({ length: 15 }, (_, i) => ({
              coordinates: {
                galaxy: query.galaxy,
                system: query.system,
                position: i + 1,
              },
              body:
                i === 0 && options.observationAvailable
                  ? {
                      id: id(20),
                      kind: 'Planet',
                      owner: id(30),
                      name: query.system === 1 ? 'Ember Watch' : 'Other Planet',
                      activity: { type: 'None' },
                      inactivity: 'Active',
                      vacation: false,
                      espionage_eligible: !options.blocker,
                      attack_blocker: options.blocker,
                    }
                  : null,
              debris: options.debris
                ? {
                    field_identity: id(40),
                    metal: '1000000',
                    crystal: '1000000',
                  }
                : null,
            })),
          }
        } else if (query.type === 'ResolveDestination') {
          const selection = query.selection
          const owned = source.bodies.find(
            (body) =>
              body.coordinates.galaxy === selection.coordinates.galaxy &&
              body.coordinates.system === selection.coordinates.system &&
              body.coordinates.position === selection.coordinates.position &&
              selection.type === 'BodyAt' &&
              body.kind === selection.kind,
          )
          result =
            selection.type === 'DebrisAt'
              ? {
                  type: 'Debris',
                  coordinates: selection.coordinates,
                  field_identity: id(40),
                }
              : selection.type === 'EmptyPositionAt'
                ? {
                    type: 'EmptyPosition',
                    coordinates: selection.coordinates,
                    slot_revision: '1',
                  }
                : {
                    type: 'Body',
                    id: owned?.id ?? id(20),
                    expected_owner: owned ? player : id(30),
                    expected_kind: selection.kind,
                  }
        } else if (
          query.type === 'FleetQuote' ||
          query.type === 'FleetEstimate'
        ) {
          const failure =
            query.type === 'FleetQuote'
              ? options.quoteError
              : options.estimateError
          if (failure) throw Error(failure)
          result = {
            intent: query.intent,
            profile_hash: source.profile_hash,
            ...(query.type === 'FleetEstimate'
              ? { estimate: true as const }
              : {
                  distance: 1000,
                  speeds: [],
                  slot_limit: '5',
                  terms_hash: 'b'.repeat(64),
                }),
            duration_ms: Math.floor(
              (options.duration * 100) / query.intent.speed_percent,
            ),
            fuel: options.fuel,
            capacity: options.capacity,
            maximum_payload: options.maximumPayload,
          }
        } else return fail(query.type)
        return {
          protocol: 4,
          ...context,
          viewer_revision: source.viewer_revision,
          sampled_at: now,
          as_of_ms: now,
          data: result,
        }
      })()
      pending.add(work)
      try {
        return await work
      } finally {
        pending.delete(work)
      }
    },
  }
  const model = new Coordinator(
    port,
    storage,
    {
      newId: () => id(sequence++),
      monotonicNowMs: () => 0,
      isOnline: () => true,
    },
    false,
  )
  await model.initialize(data.ready.session, data.ready.snapshot)
  return {
    model,
    snapshot: () => ({
      view: structuredClone(source),
      options: { ...options },
      calls: structuredClone(calls),
      launches,
      unexpected: [...unexpected],
    }),
    configure: async (patch: {
      options?: Partial<DispatchFixtureOptions>
      view?: Partial<S['BoundView4']>
    }) => {
      Object.assign(options, patch.options)
      if (patch.view) {
        source = {
          ...source,
          ...structuredClone(patch.view),
          viewer_revision: String(BigInt(source.viewer_revision) + 1n),
        }
        source.progression = {
          ...source.progression,
          production: source.bodies.map(productionFixture),
        }
        await model.refresh()
      }
    },
    hold: (kind: 'Galaxy' | 'FleetEstimate') => {
      if (gates.has(kind)) throw Error(`Already holding ${kind}`)
      let release!: () => void
      const promise = new Promise<void>((resolve) => {
        release = resolve
      })
      gates.set(kind, { promise, release })
    },
    release: async () => {
      for (const gate of gates.values()) gate.release()
      gates.clear()
      await Promise.allSettled([...pending])
    },
    dispose: () => {
      for (const gate of gates.values()) gate.release()
      gates.clear()
      model.invalidate()
    },
  }
}
export type DispatchFixture = Awaited<ReturnType<typeof createDispatchFixture>>
