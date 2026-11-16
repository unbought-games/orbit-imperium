import { Coordinator } from '../../src/client-model/coordinator'
import type {
  GamePort,
  Envelope,
  BoundReceipt,
} from '../../src/client-model/commands'
import { readyFixture } from '../../src/test-support/bootstrap'
import { empireFixture, id } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import type { components } from '../../src/contracts'

type S = components['schemas']
export type EmpireSceneInput = {
  protocol?: 4
  bodies?: S['BodyV3'][]
  constructions?: S['Construction3'][]
  missions?: S['MissionView4']
  researchOperation?: S['ResearchOperationDto'] | null
  manufacturing?: S['ManufacturingBatchDto'][]
  production?: S['ProductionDto'][]
  surface?: 'rename' | 'settings' | 'abandonment'
  sampledAt?: number
  homeworldId?: string
  catalog?: S['CatalogEntry3'][]
  screen?:
    | 'overview'
    | 'resources'
    | 'facilities'
    | 'research'
    | 'shipyard'
    | 'defense'
}
export async function createEmpireScene(input: EmpireSceneInput = {}) {
  const epoch = input.sampledAt ?? 1_800_000_000_000
  const data = { ...empireFixture(epoch), ...input }
  const { session, snapshot } = readyFixture(4)
  if (snapshot.view.protocol !== 4) throw Error('Protocol 4 required')
  const view = snapshot.view
  Object.assign(view, {
    bodies: data.bodies,
    constructions: data.constructions,
    missions: data.missions,
    catalog: data.catalog ?? [],
    homeworld_id: data.homeworldId,
    viewer_revision: '1',
    sampled_at: epoch,
    as_of_ms: epoch,
    capabilities: [
      'Construction',
      'Research',
      'Manufacturing',
      'Production',
      'Demolition',
      'Transport',
      'Galaxy',
    ].map((capability) => ({ capability, enabled: true, reason: 'Available' })),
    progression: {
      production: data.bodies.map(
        (body) =>
          input.production?.find((p) => p.body === body.id) ??
          (input.bodies
            ? productionFixture(body)
            : (data.production.find((p) => p.body === body.id) ??
              productionFixture(body))),
      ),
      research_operation: data.researchOperation,
      manufacturing: data.manufacturing,
      limits: { max_active_manufacturing_entries: 256 },
    },
  })
  view.vacation = {
    active: false,
    entered_at: null,
    earliest_exit_at: null,
    blockers: [],
  }
  snapshot.candidate.sampled_at = epoch
  const sent: Envelope[] = []
  const colony = view.bodies[1] ?? view.bodies[0]
  const abandonment: S['AbandonmentQuote4'] = {
    body: colony.id,
    terms_hash: 'abandon-review',
    release_at: Date.UTC(2026, 10, 1),
    blockers: [],
    losses: [
      {
        id: colony.id,
        name: 'Hesperia',
        kind: 'Planet',
        coordinates: colony.coordinates,
        resources: {
          metal: '4823000000',
          crystal: '2100000000',
          deuterium: '750000000',
        },
        buildings: { MetalMine: 12, CrystalMine: 10, SolarPlant: 11 },
        inventory: [
          { item: { kind: 'Ship', id: 'SmallCargo' }, count: '8' },
          { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '15' },
        ],
        construction: [],
        manufacturing: [],
      },
    ],
  }
  let next = 900
  let elapsed = 0
  let outcome: 'Committed' | 'Rejected' | 'uncertain' = 'Committed'
  let gate: Promise<void> | undefined
  let release = () => {}
  const port: GamePort = {
    currentBinding: async (_, request_id) => ({
      ...snapshot.candidate,
      request_id,
    }),
    settings: async (context) => ({
      ...snapshot.settings,
      request_id: context.request_id,
    }),
    view: async (context) =>
      structuredClone({ ...view, request_id: context.request_id }),
    world: async (context, query) => {
      if (query.type !== 'AbandonmentQuote')
        throw Error(`Unexpected world query ${query.type}`)
      return {
        protocol: 4,
        binding: view.binding,
        request_id: context.request_id,
        viewer_revision: view.viewer_revision,
        sampled_at: epoch,
        as_of_ms: epoch,
        data: structuredClone(abandonment),
      }
    },
    quote: async () => {
      throw Error('Unexpected quote')
    },
    receipt: async () => {
      throw Error('No receipt has been delivered')
    },
    submit: async (envelope): Promise<BoundReceipt> => {
      sent.push(envelope)
      if (gate) await gate
      if (outcome === 'uncertain') throw Error('Response lost')
      const common = {
        protocol: 4 as const,
        binding: view.binding,
        command_id: envelope.command_id,
        admitted_at: epoch,
        executed_at: epoch,
      }
      if (outcome === 'Rejected')
        return { ...common, status: 'Rejected', code: 'NotOwned' }
      const command = envelope.command
      if (command.type === 'CancelConstruction') view.constructions = []
      else if (command.type === 'CancelResearch')
        view.progression.research_operation = null
      else if (
        command.type === 'World' &&
        command.action.type === 'RenamePlanet'
      ) {
        const action = command.action
        view.bodies.find((b) => b.id === action.body)!.name = action.name
      } else if (command.type === 'World') {
        switch (command.action.type) {
          case 'EnterVacation':
            view.vacation = {
              active: true,
              entered_at: epoch,
              earliest_exit_at: epoch + 172800000,
              blockers: [],
            }
            break
          case 'ExitVacation':
            view.vacation = {
              active: false,
              entered_at: null,
              earliest_exit_at: null,
              blockers: [],
            }
            break
          case 'RequestEmpireDeletion':
            view.empire_deletion = {
              reason: 'Requested',
              due_at: epoch + 604800000,
            }
            break
          case 'CancelEmpireDeletion':
            view.empire_deletion = undefined
            break
          case 'AbandonPlanet':
            view.bodies = view.bodies.filter((b) => b.id !== colony.id)
            break
          default:
            throw Error(`Unexpected action ${command.action.type}`)
        }
      } else throw Error(`Unexpected command ${command.type}`)
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      return {
        ...common,
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: view.viewer_revision,
      }
    },
  }
  const model = new Coordinator(port, {
    newId: () => id(next++),
    monotonicNowMs: () => elapsed,
    isOnline: () => true,
  })
  await model.initialize(structuredClone(session), structuredClone(snapshot))
  return {
    model,
    view,
    sent,
    abandonment,
    setOutcome: (value: typeof outcome) => {
      outcome = value
    },
    hold: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    },
    release: () => {
      gate = undefined
      release()
    },
    tick: (milliseconds: number) => {
      elapsed = milliseconds
      model.tick()
    },
    refresh: async () => {
      view.viewer_revision = String(Number(view.viewer_revision) + 1)
      await model.refresh()
    },
  }
}
