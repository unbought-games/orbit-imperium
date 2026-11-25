import type { components } from '../../src/contracts'
import type { GamePort, WorldQuery } from '../../src/client-model/commands'
import { productionFixture } from '../../src/test-support/production'
import { Coordinator } from '../../src/client-model/coordinator'
import {
  dispatchData,
  id,
  now,
  player,
  type DispatchFixtureOptions,
} from './dispatch-data'

type S = components['schemas']
/** External port fixtures only. All client request validation, projection and state transitions use Coordinator. */
export async function createDispatchFixture(
  readGalaxy?: (
    query: Extract<WorldQuery, { type: 'Galaxy' }>,
  ) => Promise<S['GalaxySystem4']>,
  monotonicNowMs = () => 0,
  dimensions?: { galaxies: number; systems_per_galaxy: number },
) {
  const data = dispatchData()
  if (dimensions) Object.assign(data.ready.snapshot.settings, dimensions)
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
  let lastCommandId: string | undefined
  let lastLaunch: Extract<S['WorldAction4'], { type: 'LaunchFleet' }> | null =
    null
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
    reports: async (context, _cursor, _hidden, query) => {
      if (options.resourceVisibility === 'Error') throw Error('Unavailable')
      return {
        protocol: 4,
        ...context,
        viewer_revision: source.viewer_revision,
        sampled_at: now,
        as_of_ms: now,
        data: {
          items:
            query?.filter.target_body === id(20) &&
            options.resourceVisibility !== 'Missing'
              ? [
                  {
                    id: id(90),
                    kind: 'Espionage',
                    observed_at: now - 3600000,
                    read: false,
                    hidden: false,
                    preview: {
                      kind: 'Espionage',
                      target: {
                        body: id(20),
                        owner: id(30),
                        kind: 'Planet',
                        coordinates: { galaxy: 1, system: 1, position: 1 },
                      },
                      resources:
                        options.resourceVisibility === 'Unknown'
                          ? { visibility: 'Unknown' }
                          : {
                              visibility: 'Known',
                              value: {
                                metal: '12000000000',
                                crystal: '6000000000',
                                deuterium: '2000000000',
                              },
                            },
                    },
                  },
                ]
              : [],
          next_cursor: null,
          has_more: false,
          as_of_ms: now,
        },
      }
    },
    quote: async () => fail('progression quote'),
    submit: async (envelope) => {
      if (
        envelope.command.type !== 'World' ||
        envelope.command.action.type !== 'LaunchFleet'
      )
        return fail('non-fleet command')
      lastCommandId = envelope.command_id
      lastLaunch = structuredClone(envelope.command.action)
      launches++
      const work = (async () => {
        await gates.get('LaunchFleet')?.promise
        if (options.launchOutcome === 'RateLimited')
          throw { status: 429, code: 'RateLimited', retryAfterMs: 60_000 }
        return {
          protocol: 4 as const,
          binding: envelope.binding,
          command_id: envelope.command_id,
          admitted_at: now,
          executed_at: now,
          ...(options.launchOutcome === 'Rejected'
            ? {
                status: 'Rejected' as const,
                code: options.rejectionCode ?? ('BeginnerProtected' as const),
              }
            : options.launchOutcome === 'Pending'
              ? { status: 'Pending' as const, executed_at: null }
              : {
                  status: 'Committed' as const,
                  result_ids: [id(80)],
                  minimum_viewer_revision: source.viewer_revision,
                }),
        }
      })()
      pending.add(work)
      try {
        return await work
      } finally {
        pending.delete(work)
      }
    },
    receipt: async () => fail('receipt polling'),
    world: async (context, query) => {
      calls.push(structuredClone(query))
      const work = (async (): Promise<S['BoundWorld4']> => {
        await gates.get(query.type)?.promise
        let result: S['BoundWorld4']['data']
        if (query.type === 'Galaxy' && readGalaxy) {
          result = await readGalaxy(query)
        } else if (query.type === 'Galaxy') {
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
              ...(i === 0 && options.observedMoon
                ? {
                    moon: {
                      id: id(70),
                      name: 'Selene',
                      diameter_km: 8500,
                      activity: { type: 'None' as const },
                    },
                  }
                : {}),
              debris: options.debris
                ? {
                    field_identity: id(40),
                    metal: '1000000',
                    crystal: '1000000',
                  }
                : null,
            })),
          }
        } else if (query.type === 'MissileQuote' && options.missileRules) {
          result = {
            intent: query.intent,
            source_coordinates: source.bodies[0].coordinates,
            target_coordinates: { galaxy: 1, system: 371, position: 1 },
            interceptor_body: query.intent.target.id,
            distance: 0,
            range: 24,
            duration_ms: 6000,
            weapons: 0,
            speed: 5,
            rules: options.missileRules,
            profile_hash: source.profile_hash,
            terms_hash: 'b'.repeat(64),
          }
        } else if (query.type === 'ResolveDestination') {
          if (options.resolveError) throw Error(options.resolveError)
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
                    id:
                      owned?.id ??
                      (options.observedMoon &&
                      selection.kind === 'Moon' &&
                      selection.coordinates.position === 1
                        ? id(70)
                        : id(20)),
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
          const liveQuote =
            query.type === 'FleetQuote' && query.intent.cargo_fill
              ? options.liveQuote
              : undefined
          result = {
            intent: liveQuote
              ? { ...query.intent, cargo: { ...liveQuote.cargo } }
              : query.intent,
            profile_hash: source.profile_hash,
            ...(query.type === 'FleetEstimate'
              ? { estimate: true as const }
              : {
                  distance: 1000,
                  speeds: [],
                  slot_limit: '5',
                  ...(query.intent.mission === 'Hold'
                    ? {
                        holding: {
                          duration_ms: (query.intent.hold_hours ?? 1) * 3600000,
                          rates: { SmallCargo: 10 },
                          fuel: '4000000',
                        },
                      }
                    : {}),
                  terms_hash: liveQuote?.hash || 'b'.repeat(64),
                }),
            duration_ms: Math.floor(
              (options.duration * 100) / query.intent.speed_percent,
            ),
            fuel: options.fuel,
            capacity: liveQuote?.capacity ?? options.capacity,
            maximum_payload:
              liveQuote?.maximumPayload ?? options.maximumPayload,
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
  const model = new Coordinator(port, {
    newId: () => id(sequence++),
    monotonicNowMs,
    isOnline: () => true,
  })
  await model.initialize(data.ready.session, data.ready.snapshot)
  return {
    model,
    settleLaunch: async (status: 'Committed' | 'Rejected') => {
      if (!lastCommandId) throw Error('No launch submitted')
      await model.onUpdate({binding: source.binding, cursor: 'launch-outcome', event: {type: 'Outcome', receipt: {
        binding: source.binding, command_id: lastCommandId, protocol: 4, admitted_at: now, executed_at: now,
        ...(status === 'Rejected' ? {status, code: 'NoFleetSlot'} : {status, result_ids: [id(80)], minimum_viewer_revision: source.viewer_revision}),
      }}})
    },
    snapshot: () => ({
      view: structuredClone(source),
      options: { ...options },
      calls: structuredClone(calls),
      launches,
      lastLaunch: structuredClone(lastLaunch),
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
    hold: (kind: 'Galaxy' | 'FleetEstimate' | 'FleetQuote' | 'LaunchFleet') => {
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
