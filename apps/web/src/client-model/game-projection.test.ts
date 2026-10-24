import { describe, expect, it, vi } from 'vitest'
import { galaxyFlights, pendingProbe, probeAvailability } from './galaxy-fleets'
import { sendGalaxyProbe } from './send-galaxy-probe'
import type { components } from '../contracts'
import type { Attempt, BoundProgressionOptions, Command } from './commands'
import { attemptKey } from './commands'
import { createGameStore, type GameState } from './game-store'
import { buildingProgress } from './building-progress'
import { researchProgress } from './research-progress'
import {
  currentServerTime,
  nextWorkDelay,
  pendingConstruction,
  projectGameView,
  pendingWork,
  matchesQuote,
  canSubmitIntent,
  pendingFleetLaunches,
  occupiedFleetSlots,
  snapshotNeedsReceipt,
  pendingBody,
  pendingCommand,
  canSubmitQuote,
  type SubmittedIntent,
} from './game-projection'

type S = components['schemas']
export function snapshot(): S['BoundView4'] {
  return {
    protocol: 4,
    binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
    request_id: 'r',
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
    progress: {
      sampled_at: 1000,
      scopes: [],
      minimum_revision_pending: false,
      projection_limit: null,
    },
    speed: 10,
    profile_hash: 'profile',
    research: [],
    catalog: [],
    capabilities: [],
    constructions: [],
    fleets: [],
    reports: [],
    destinations: [],
    reports_truncated: false,
    destinations_truncated: false,
    bodies: [
      {
        id: 'body',
        kind: 'Planet',
        coordinates: { galaxy: 1, system: 1, position: 1 },
        amounts: { metal: '1000', crystal: '1000', deuterium: '1000' },
        capacity: { metal: '2000', crystal: '2000', deuterium: '2000' },
        levels: {
          MetalMine: 1,
          CrystalMine: 1,
          DeuteriumSynthesizer: 1,
          SolarPlant: 1,
          MetalStorage: 0,
          CrystalStorage: 0,
          DeuteriumTank: 0,
          RoboticsFactory: 0,
          ResearchLab: 1,
          Shipyard: 1,
        },
        fields: 100,
        fields_used: 6,
        fields_reserved: 0,
        energy: { supply: '100', demand: '50', utilization: '1000000' },
        inventories: [
          { item: { kind: 'Ship', id: 'SmallCargo' }, count: '10' },
        ],
      },
    ],
    progression: {
      production: [
        {
          body: 'body',
          settings_revision: '1',
          editable: ['metal_mine'],
          settings: {
            metal_mine: 100,
            crystal_mine: 100,
            deuterium_synthesizer: 100,
            solar_plant: 100,
            fusion_reactor: 100,
            solar_satellite: 100,
          },
          gross_per_hour: {
            metal: '3600000',
            crystal: '1800000',
            deuterium: '3600000',
          },
          fuel_deuterium_per_hour: '5400000',
          net_deuterium_per_hour: { sign: 'Negative', magnitude: '1800000' },
          energy_supply: '100',
          energy_demand: '50',
          utilization: '1000000',
          fuel_utilization: '1000000',
        },
      ],
      research_operation: null,
      manufacturing: [],
      limits: { max_active_manufacturing_entries: 256 },
    },
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  }
}

function state(): GameState {
  return {
    ...createGameStore().getState(),
    view: snapshot(),
    receivedAt: 100,
    now: 100,
  }
}
function quote(): BoundProgressionOptions {
  const view = snapshot()
  return {
    protocol: 4,
    binding: view.binding,
    request_id: 'q',
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
    request: { type: 'Upgrade', body: 'body', building: 'MetalMine' },
    terms_hash: 'hash',
    blockers: [],
    estimates: null,
    terms: {
      type: 'Building',
      profile_hash: 'profile',
      body: 'body',
      building: 'MetalMine',
      action: 'Upgrade',
      source_level: 1,
      target_level: 2,
      paid: { metal: '600', crystal: '150', deuterium: '0' },
      duration_ms: 5000,
      formula: 'BuildingRedesign2011',
      facilities: [],
      required_energy: '0',
      reserve_fields: 1,
    },
  }
}
function intent(
  s: GameState,
  command: Command,
  evidence?: SubmittedIntent['quote'],
) {
  const key = attemptKey(s.view!.binding, 'command')
  const a: Attempt = {
    envelope: {
      protocol: 4,
      binding: s.view!.binding,
      command_id: 'command',
      command,
      presence: null,
    },
    status: 'submitting',
    receipt: null,
    reconciled: false,
  }
  s.attempts = new Map([[key, a]])
  s.intents = new Map([
    [key, { quote: evidence, submittedAt: 1000, baseRevision: '1' }],
  ])
  return a
}
const upgrade: Command = {
  type: 'StartUpgrade',
  body: 'body',
  building: 'MetalMine',
  expected_terms_hash: 'hash',
}

describe('building tile progress', () => {
  it('derives the target and countdown from confirmed work without completing it locally', () => {
    const s = state()
    s.view!.constructions = [
      {
        id: 'work',
        body: 'body',
        building: 'MetalMine',
        target_level: 2,
        due_at: 110000,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ]
    expect(buildingProgress(s, 'other')).toBeNull()
    expect(buildingProgress(s, 'body')).toMatchObject({
      building: 'MetalMine',
      targetLevel: 2,
      direction: 'up',
      countdown: '1m 49s',
      secondsRemaining: 109,
      dueAt: 110000,
      status: 'In progress',
      operationId: 'work',
      canCancel: true,
    })
    s.now += 2000
    expect(buildingProgress(s, 'body')?.countdown).toBe('1m 47s')
    s.now += 200000
    expect(buildingProgress(s, 'body')?.countdown).toBe('Awaiting confirmation')
    expect(buildingProgress(s, 'body')?.secondsRemaining).toBeNull()
    expect(s.view!.bodies[0].levels.MetalMine).toBe(1)
    s.view!.constructions = []
    expect(buildingProgress(s, 'body')).toBeNull()
  })
  it('shows submitted work immediately and removes rejected work', () => {
    const s = state()
    const attempt = intent(s, upgrade, quote())
    expect(buildingProgress(s, 'body')).toMatchObject({
      targetLevel: 2,
      countdown: '5s',
      status: 'Confirming',
      operationId: null,
      canCancel: false,
    })
    attempt.status = 'uncertain'
    expect(buildingProgress(s, 'body')?.status).toBe('Awaiting confirmation')
    attempt.status = 'rejected'
    expect(buildingProgress(s, 'body')).toBeNull()
  })
  it('keeps demolition and cancellation distinct from upgrading', () => {
    const s = state()
    s.view!.constructions = [
      {
        id: 'work',
        body: 'body',
        building: 'MetalMine',
        target_level: 0,
        due_at: 3662000,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ]
    expect(buildingProgress(s, 'body')).toMatchObject({
      direction: 'down',
      targetLevel: 0,
      countdown: '1h 1m',
    })
    const attempt = intent(s, { type: 'CancelConstruction', operation: 'work' })
    expect(buildingProgress(s, 'body')?.status).toBe('Cancelling')
    expect(buildingProgress(s, 'body')?.canCancel).toBe(false)
    attempt.status = 'rejected'
    expect(buildingProgress(s, 'body')?.status).toBe('In progress')
    expect(buildingProgress(s, 'body')?.canCancel).toBe(true)
  })
})

describe('one live game projection', () => {
  it('uses monotonic elapsed time, exact per-hour rates, negative fuel and storage caps', () => {
    const s = state()
    s.now = 1100
    expect(currentServerTime(s)).toBe(2000)
    expect(projectGameView(s)?.bodies[0].amounts).toEqual({
      metal: '2000',
      crystal: '1500',
      deuterium: '500',
    })
    s.now = 4100
    expect(projectGameView(s)?.bodies[0].amounts).toEqual({
      metal: '2000',
      crystal: '2000',
      deuterium: '0',
    })
    expect(s.view?.bodies[0].amounts.metal).toBe('1000')
  })
  it('preserves above-cap stocks and stops extrapolation at a known economy change', () => {
    const s = state()
    s.view!.bodies[0].amounts.metal = '3000'
    s.view!.constructions = [
      {
        id: 'operation',
        body: 'body',
        building: 'MetalMine',
        target_level: 2,
        due_at: 1500,
        paid: { metal: '60', crystal: '0', deuterium: '0' },
      },
    ]
    s.now = 5100
    expect(projectGameView(s)?.bodies[0].amounts).toEqual({
      metal: '3000',
      crystal: '1250',
      deuterium: '750',
    })
  })
  it.each([3, 4] as const)(
    'integrates protocol %i signed rates at empty, full and overfull storage',
    (protocol) => {
      for (const [amount, metal, deuterium] of [
        ['0', '1000', '0'],
        ['2000', '2000', '1500'],
        ['3000', '3000', '2500'],
      ]) {
        const s = state()
        s.view =
          protocol === 4
            ? snapshot()
            : { ...snapshot(), protocol, capabilities: [] }
        s.view.bodies[0].amounts = {
          metal: amount,
          crystal: amount,
          deuterium: amount,
        }
        s.now = 1100
        expect(projectGameView(s)?.bodies[0].amounts).toEqual({
          metal,
          crystal: amount === '0' ? '500' : amount,
          deuterium,
        })
      }
    },
  )
  it.each([3, 4] as const)(
    'keeps protocol %i stocks unchanged when production is missing',
    (protocol) => {
      const s = state()
      s.view =
        protocol === 4
          ? snapshot()
          : { ...snapshot(), protocol, capabilities: [] }
      s.view.progression.production = []
      s.now = 1100
      expect(projectGameView(s)?.bodies[0].amounts).toEqual(
        s.view.bodies[0].amounts,
      )
    },
  )
  it('integrates legacy body production without progression data', () => {
    const s = state()
    const modern = snapshot()
    s.view = {
      protocol: 2,
      binding: modern.binding,
      request_id: modern.request_id,
      viewer_revision: modern.viewer_revision,
      sampled_at: modern.sampled_at,
      as_of_ms: modern.as_of_ms,
      progress: modern.progress,
      speed: modern.speed,
      profile_hash: modern.profile_hash,
      research: [],
      catalog: [],
      capabilities: [],
      constructions: [],
      fleets: [],
      reports: [],
      destinations: [],
      reports_truncated: false,
      destinations_truncated: false,
      bodies: [
        {
          ...modern.bodies[0],
          inventories: [],
          levels: {
            MetalMine: 1,
            CrystalMine: 1,
            DeuteriumSynthesizer: 1,
            SolarPlant: 1,
          },
          production: { metal: '3600000', crystal: '0', deuterium: '1800000' },
        },
      ],
    }
    s.now = 1100
    expect(projectGameView(s)?.bodies[0].amounts).toEqual({
      metal: '2000',
      crystal: '1000',
      deuterium: '1500',
    })
  })
  it('reserves quote payment immediately and exposes an estimated queue without fabricating operation IDs', () => {
    const s = state()
    intent(s, upgrade, quote())
    expect(projectGameView(s)?.bodies[0].amounts).toEqual({
      metal: '400',
      crystal: '850',
      deuterium: '1000',
    })
    expect(pendingConstruction(s, 'body')).toMatchObject({
      commandId: 'command',
      operationId: null,
      target_level: 2,
      startedAt: 1000,
      due_at: 6000,
      status: 'submitting',
    })
    expect(projectGameView(s)?.constructions).toEqual([])
  })
  it('accrues production after spending at full storage', () => {
    const s = state()
    s.view!.bodies[0].amounts.metal = '2000'
    intent(s, upgrade, quote())
    s.now = 600
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1900')
  })
  it('rolls back rejected reservations and retains uncertain reservations on the original revision', () => {
    const s = state(),
      a = intent(s, upgrade, quote())
    a.status = 'uncertain'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('400')
    a.status = 'rejected'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1000')
    expect(pendingConstruction(s, 'body')).toBeNull()
  })
  it('does not double debit a snapshot that arrives before the receipt', () => {
    const s = state()
    intent(s, upgrade, quote())
    s.view!.viewer_revision = '2'
    s.view!.bodies[0].amounts.metal = '400'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('400')
  })
  it('retains a committed reservation until its receipt revision, then removes it atomically with the snapshot', () => {
    const s = state(),
      a = intent(s, upgrade, quote())
    a.status = 'committed'
    a.receipt = {
      protocol: 4,
      binding: s.view!.binding,
      command_id: 'command',
      admitted_at: 1000,
      executed_at: 1100,
      status: 'Committed',
      minimum_viewer_revision: '3',
      result_ids: ['real-operation'],
    }
    s.view!.viewer_revision = '2'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('400')
    expect(pendingConstruction(s, 'body')?.operationId).toBe('real-operation')
    s.view!.viewer_revision = '3'
    s.view!.bodies[0].amounts.metal = '400'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('400')
    expect(pendingConstruction(s, 'body')).toBeNull()
  })
  it('refunds cancellation immediately and restores the operation on rejection', () => {
    const s = state()
    const work = {
      id: 'operation',
      body: 'body',
      building: 'MetalMine' as const,
      target_level: 2,
      due_at: 6000,
      paid: { metal: '600', crystal: '150', deuterium: '0' },
    }
    s.view!.constructions = [work]
    const a = intent(s, { type: 'CancelConstruction', operation: 'operation' })
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1600')
    expect(projectGameView(s)?.constructions).toEqual([])
    a.status = 'rejected'
    expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1000')
    expect(projectGameView(s)?.constructions).toHaveLength(1)
  })
  it('keeps next body actions disabled after optimistic cancellation until the confirmed snapshot includes it', () => {
    const s = state()
    s.view!.constructions = [
      {
        id: 'operation',
        body: 'body',
        building: 'MetalMine',
        target_level: 2,
        due_at: 6000,
        paid: { metal: '600', crystal: '150', deuterium: '0' },
      },
    ]
    const attempt = intent(s, {
      type: 'CancelConstruction',
      operation: 'operation',
    })
    expect(projectGameView(s)?.constructions).toEqual([])
    expect(pendingBody(s, 'body')).toBe(true)
    expect(pendingBody(s, 'other-body')).toBe(false)
    attempt.status = 'committed'
    attempt.receipt = {
      protocol: 4,
      binding: s.view!.binding,
      command_id: 'command',
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Committed',
      minimum_viewer_revision: '2',
      result_ids: [],
    }
    expect(pendingBody(s, 'body')).toBe(true)
    s.view!.viewer_revision = '2'
    s.view!.constructions = []
    expect(pendingBody(s, 'body')).toBe(false)
  })
  it('releases a body lock after cancellation rejection and retains restored unresolved cancellation locks', () => {
    const s = state()
    const attempt = intent(s, {
      type: 'CancelConstruction',
      operation: 'missing-operation',
    })
    s.intents = new Map()
    expect(pendingBody(s, 'body')).toBe(true)
    attempt.status = 'rejected'
    expect(pendingBody(s, 'body')).toBe(false)
  })
  it('reserves fleet cargo, fuel and stationed ships together', () => {
    const s = state()
    const fleet: S['FleetTerms4'] = {
      intent: {
        origin: 'body',
        destination: {
          type: 'Body',
          id: 'other',
          expected_owner: 'other-player',
          expected_kind: 'Planet',
        },
        mission: 'Transport',
        ships: [{ owner: 'p', ship_type: 'SmallCargo', count: '3' }],
        cargo: { metal: '300', crystal: '100', deuterium: '50' },
        speed_percent: 100,
      },
      profile_hash: 'profile',
      distance: 1,
      speeds: [],
      duration_ms: 10000,
      fuel: '75',
      capacity: '1000',
      maximum_payload: '925',
      slot_limit: '1',
      terms_hash: 'fleet-hash',
    }
    const launch = intent(
      s,
      {
        type: 'World',
        action: {
          type: 'LaunchFleet',
          intent: fleet.intent,
          expected_terms_hash: fleet.terms_hash,
        },
      },
      fleet,
    )
    const projected = projectGameView(s)
    expect(projected?.bodies[0].amounts).toEqual({
      metal: '700',
      crystal: '900',
      deuterium: '875',
    })
    expect(
      projected?.protocol === 4 && projected.bodies[0].inventories[0].count,
    ).toBe('7')
    expect(pendingFleetLaunches(s)).toHaveLength(1)
    expect(occupiedFleetSlots(s)).toBe(1)
    launch.status = 'uncertain'
    expect(occupiedFleetSlots(s)).toBe(1)
    launch.status = 'pending'
    const savedIntents = s.intents
    s.intents = new Map()
    expect(occupiedFleetSlots(s)).toBe(1)
    s.intents = savedIntents
    launch.status = 'rejected'
    expect(occupiedFleetSlots(s)).toBe(0)
    launch.status = 'committed'
    launch.receipt = {
      protocol: 4,
      binding: s.view!.binding,
      command_id: 'command',
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Committed',
      minimum_viewer_revision: '2',
      result_ids: ['fleet'],
    }
    expect(occupiedFleetSlots(s)).toBe(1)
    if (s.view?.protocol !== 4) throw Error('fixture protocol')
    s.view.viewer_revision = '2'
    s.view.missions.fleets = [
      {
        id: 'fleet',
        intent: fleet.intent,
        origin: s.view.bodies[0]!.coordinates,
        destination: { galaxy: 1, system: 2, position: 1 },
        leg: 'Returning',
        ships: [{ ship_type: 'SmallCargo', count: '3' }],
        cargo: fleet.intent.cargo,
        due_at: 20000,
        launched_at: 1000,
        duration_ms: 10000,
        paid_fuel: fleet.fuel,
        can_recall: false,
      },
    ]
    expect(occupiedFleetSlots(s)).toBe(1)
    expect(pendingFleetLaunches(s)).toHaveLength(0)
  })
  it('uses one fleet confirmation gate for pending commands, resources, stationed ships and global slots', () => {
    const s = state()
    s.ready = true
    const fleet: S['FleetTerms4'] = {
      intent: {
        origin: 'body',
        destination: {
          type: 'Body',
          id: 'target',
          expected_owner: 'other',
          expected_kind: 'Planet',
        },
        mission: 'Transport',
        ships: [{ owner: 'p', ship_type: 'SmallCargo', count: '3' }],
        cargo: { metal: '300', crystal: '100', deuterium: '50' },
        speed_percent: 100,
      },
      profile_hash: 'profile',
      distance: 1,
      speeds: [],
      duration_ms: 10000,
      fuel: '75',
      capacity: '1000',
      maximum_payload: '925',
      slot_limit: '1',
      terms_hash: 'fleet-hash',
    }
    const command: Command = {
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: fleet.intent,
        expected_terms_hash: fleet.terms_hash,
      },
    }
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    const pending = intent(s, upgrade, quote())
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    s.view!.bodies[0].amounts.metal = '899'
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.view!.bodies[0].amounts.metal = '1000'
    pending.status = 'rejected'
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    s.view!.bodies[0].amounts.deuterium = '124'
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.view!.bodies[0].amounts.deuterium = '125'
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    s.view!.bodies[0].inventories[0].count = '2'
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.view!.bodies[0].inventories[0].count = '3'
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    const otherFleet = {
      ...fleet,
      intent: { ...fleet.intent, origin: 'other-body' },
    }
    intent(
      s,
      {
        type: 'World',
        action: {
          type: 'LaunchFleet',
          intent: otherFleet.intent,
          expected_terms_hash: otherFleet.terms_hash,
        },
      },
      otherFleet,
    )
    expect(pendingBody(s, 'body')).toBe(false)
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.intents = new Map()
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.attempts = new Map()
    expect(canSubmitQuote(s, command, fleet)).toBe(true)
    if (s.view?.protocol !== 4) throw Error('fixture protocol')
    s.view.missions.fleets = [
      {
        id: 'active-fleet',
        intent: fleet.intent,
        origin: { galaxy: 1, system: 1, position: 1 },
        destination: { galaxy: 1, system: 2, position: 1 },
        leg: 'Returning',
        ships: [{ ship_type: 'SmallCargo', count: '3' }],
        cargo: fleet.intent.cargo,
        due_at: 20000,
        launched_at: 1000,
        duration_ms: 10000,
        paid_fuel: fleet.fuel,
        can_recall: false,
      },
    ]
    expect(canSubmitQuote(s, command, fleet)).toBe(false)
    s.view.missions.fleets = []
    expect(
      canSubmitQuote(s, command, { ...fleet, profile_hash: 'stale-profile' }),
    ).toBe(false)
  })
  it('projects requested production settings and freezes accrual until authoritative rates arrive', () => {
    const s = state(),
      view = s.view as S['BoundView4']
    intent(s, {
      type: 'SetProduction',
      body: 'body',
      expected_settings_revision: '1',
      settings: { ...view.progression.production[0].settings, metal_mine: 0 },
    })
    s.now = 1100
    const projected = projectGameView(s)
    expect(projected?.bodies[0].amounts.metal).toBe('1000')
    expect(
      projected?.protocol === 4 &&
        projected.progression.production[0].settings.metal_mine,
    ).toBe(0)
    expect(snapshotNeedsReceipt(s, { ...view, viewer_revision: '2' })).toBe(
      true,
    )
  })
  it('does not hold snapshots for presence-only work or restored attempts with no optimistic inputs', () => {
    const s = state(),
      next = { ...s.view!, viewer_revision: '2' }
    intent(s, {
      type: 'World',
      action: {
        type: 'RecordForegroundPresence',
        body: 'body',
        cause: 'BodyVisit',
        paired_command_id: null,
      },
    })
    expect(snapshotNeedsReceipt(s, next)).toBe(false)
    intent(s, upgrade, quote())
    s.intents = new Map()
    expect(snapshotNeedsReceipt(s, next)).toBe(false)
  })
  it.each(['Research', 'Manufacture'] as const)(
    'reserves %s payments and exposes pending work across summaries',
    (type) => {
      const s = state(),
        proposal = quote()
      if (type === 'Research') {
        proposal.request = { type, host: 'body', research: 'EnergyTechnology' }
        proposal.terms = {
          type,
          profile_hash: 'profile',
          host: 'body',
          research: 'EnergyTechnology',
          source_level: 0,
          target_level: 1,
          paid: { metal: '100', crystal: '200', deuterium: '300' },
          duration_ms: 10000,
          formula: 'ResearchClassic',
          labs: [],
          effective_lab: '1',
          required_energy: '0',
        }
        const researchAttempt = intent(
          s,
          {
            type: 'StartResearch',
            host: 'body',
            research: 'EnergyTechnology',
            expected_terms_hash: 'hash',
          },
          proposal,
        )
        expect(researchProgress(s)).toMatchObject({
          research: 'EnergyTechnology',
          targetLevel: 1,
          countdown: '10s',
          status: 'Confirming',
          operationId: null,
          canCancel: false,
        })
        researchAttempt.status = 'uncertain'
        expect(researchProgress(s)?.status).toBe('Awaiting confirmation')
        researchAttempt.status = 'rejected'
        expect(researchProgress(s)).toBeNull()
        researchAttempt.status = 'submitting'
      } else {
        proposal.request = {
          type,
          body: 'body',
          item: { kind: 'Ship', id: 'SmallCargo' },
          quantity: '2',
        }
        proposal.terms = {
          type,
          profile_hash: 'profile',
          body: 'body',
          item: { kind: 'Ship', id: 'SmallCargo' },
          quantity: '2',
          paid: { metal: '100', crystal: '200', deuterium: '300' },
          unit_cost: { metal: '50', crystal: '100', deuterium: '150' },
          unit_duration_ms: 10000,
          formula: 'ManufactureClassic',
          facilities: [],
        }
        intent(
          s,
          {
            type: 'StartManufacture',
            body: 'body',
            item: { kind: 'Ship', id: 'SmallCargo' },
            quantity: '2',
            expected_terms_hash: 'hash',
          },
          proposal,
        )
      }
      expect(projectGameView(s)?.bodies[0].amounts).toEqual({
        metal: '900',
        crystal: '800',
        deuterium: '700',
      })
      const work = pendingWork(s, 'body')
      expect(
        type === 'Research'
          ? work.research?.terms.type
          : work.manufacturing[0]?.terms.type,
      ).toBe(type)
      s.attempts.values().next().value!.status = 'rejected'
      expect(pendingWork(s, 'body')).toEqual({
        construction: null,
        research: null,
        manufacturing: [],
      })
    },
  )
  it('never applies a quote to a different body, request, terms hash or universe', () => {
    const s = state(),
      proposal = quote()
    expect(matchesQuote(upgrade, proposal, s.view!)).toBe(true)
    expect(matchesQuote({ ...upgrade, body: 'other' }, proposal, s.view!)).toBe(
      false,
    )
    expect(
      matchesQuote(
        { ...upgrade, expected_terms_hash: 'stale' },
        proposal,
        s.view!,
      ),
    ).toBe(false)
    expect(
      matchesQuote(
        upgrade,
        { ...proposal, binding: { ...proposal.binding, epoch: 'other' } },
        s.view!,
      ),
    ).toBe(false)
    const changedProfile = { ...s.view!, profile_hash: 'other-profile' }
    expect(matchesQuote(upgrade, proposal, changedProfile)).toBe(false)
  })
  it('blocks a fleet when its live origin inventory cannot fulfill the manifest', () => {
    const s = state()
    const command: Command = {
      type: 'World',
      action: {
        type: 'LaunchFleet',
        expected_terms_hash: 'hash',
        intent: {
          origin: 'body',
          destination: {
            type: 'Body',
            id: 'target',
            expected_owner: 'other',
            expected_kind: 'Planet',
          },
          mission: 'Transport',
          ships: [{ owner: 'p', ship_type: 'SmallCargo', count: '11' }],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          speed_percent: 100,
        },
      },
    }
    expect(
      canSubmitIntent(s, command, { submittedAt: 1000, baseRevision: '1' }),
    ).toBe(false)
  })
  it('reserves building fields and shows the same pending construction in all work selectors', () => {
    const s = state()
    intent(s, upgrade, quote())
    expect(projectGameView(s)?.bodies[0].fields_reserved).toBe(1)
    expect(pendingWork(s, 'body').construction?.commandId).toBe('command')
  })
})

it('bounds local production at unresolved progress and freezes old-server snapshots conservatively', () => {
  const s = state()
  s.now = 4100
  s.view!.progress = {
    sampled_at: 1000,
    scopes: [],
    minimum_revision_pending: false,
    projection_limit: 1500,
  }
  expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1500')
  delete s.view!.progress
  expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1000')
})

it('uses accepted creator references for dependent cancellation and rebases a rejected parent without a false refund', () => {
  const s = state()
  s.view!.progress!.command_references = true
  const parent = intent(s, upgrade, quote())
  expect(pendingConstruction(s, 'body')?.operationId).toBeNull()
  parent.status = 'pending'
  parent.receipt = {
    protocol: 4,
    binding: s.view!.binding,
    command_id: 'command',
    admitted_at: 1000,
    executed_at: null,
    status: 'Pending',
  }
  expect(pendingConstruction(s, 'body')?.operationId).toBe('command')
  expect(buildingProgress(s, 'body')?.canCancel).toBe(true)
  const child: Attempt = {
    envelope: {
      protocol: 4,
      binding: s.view!.binding,
      command_id: 'cancel',
      command: { type: 'CancelConstruction', operation: 'command' },
      presence: null,
    },
    status: 'pending',
    receipt: null,
    reconciled: false,
  }
  const key = attemptKey(s.view!.binding, 'cancel')
  s.attempts.set(key, child)
  s.intents.set(key, {
    submittedAt: 1001,
    baseRevision: '1',
    dependsOn: 'command',
  })
  expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1000')
  parent.status = 'rejected'
  expect(projectGameView(s)?.bodies[0].amounts.metal).toBe('1000')
  s.view!.progress!.command_references = false
  parent.status = 'pending'
  expect(pendingConstruction(s, 'body')?.operationId).toBeNull()
})

it('does not make an accepted construction block an independent manufacturing order', () => {
  const s = state()
  const parent = intent(s, upgrade, quote())
  parent.status = 'pending'
  expect(
    pendingCommand(s, {
      type: 'StartManufacture',
      body: 'body',
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
      expected_terms_hash: 'terms',
    }),
  ).toBe(false)
  expect(pendingCommand(s, { ...upgrade, building: 'CrystalMine' })).toBe(true)
})

it('derives due work from confirmed state and the anchored server clock', () => {
  const store = createGameStore()
  expect(nextWorkDelay(store.getState())).toBe(Infinity)
  const view = snapshot()
  store.setState({ view, receivedAt: 20000, now: 20500 })
  expect(nextWorkDelay(store.getState())).toBe(Infinity)
  view.constructions.push({
    id: 'work',
    body: 'body',
    building: 'MetalMine',
    target_level: 2,
    due_at: 3000,
    paid: { metal: '0', crystal: '0', deuterium: '0' },
  })
  expect(nextWorkDelay(store.getState())).toBe(1500)
  store.setState({ now: 22500 })
  expect(nextWorkDelay(store.getState())).toBe(-500)
  view.constructions = []
  expect(nextWorkDelay(store.getState())).toBe(Infinity)
})

describe('galaxy fleet actions', () => {
  const at: S['GalaxyPosition4'] = {
    coordinates: { galaxy: 1, system: 1, position: 2 },
    debris: null,
    body: {
      id: 'target',
      owner: 'enemy',
      kind: 'Planet',
      activity: { type: 'None' },
      inactivity: 'Active',
      vacation: false,
      attack_blocker: null,
      espionage_eligible: true,
    },
  }
  const spyIntent: S['FleetIntent4'] = {
    origin: 'body',
    destination: {
      type: 'Body',
      id: 'target',
      expected_kind: 'Planet',
      expected_owner: 'enemy',
    },
    mission: 'Espionage',
    ships: [{ owner: 'p', ship_type: 'EspionageProbe', count: '1' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  }
  const terms: S['FleetTerms4'] = {
    intent: spyIntent,
    profile_hash: 'profile',
    terms_hash: 'spy-quote',
    distance: 1000,
    speeds: [],
    duration_ms: 30000,
    fuel: '75',
    capacity: '1000',
    maximum_payload: '925',
    slot_limit: '3',
  }
  function spyState() {
    const s = state()
    s.ready = true
    s.binding = s.view!.binding
    const v = s.view as S['BoundView4']
    v.capabilities = [
      { capability: 'Espionage', enabled: true, reason: 'Available' },
    ]
    v.bodies[0].inventories.push({
      item: { kind: 'Ship', id: 'EspionageProbe' },
      count: '2',
    })
    v.missions.fleet_slots = '3'
    return s
  }
  const command = {
    type: 'World',
    action: {
      type: 'LaunchFleet',
      intent: spyIntent,
      expected_terms_hash: terms.terms_hash,
    },
  } as const
  const fleet: S['OwnMission4'] = {
    id: 'fleet',
    intent: spyIntent,
    origin: { galaxy: 1, system: 1, position: 1 },
    destination: at.coordinates,
    leg: 'Outbound',
    ships: [{ ship_type: 'EspionageProbe', count: '1' }],
    cargo: spyIntent.cargo,
    due_at: 31000,
    launched_at: 1000,
    duration_ms: 30000,
    paid_fuel: '75',
    can_recall: true,
  }

  it('marks confirmed outbound fleets at their destination and return legs only at home', () => {
    const s = spyState(),
      v = s.view as S['BoundView4']
    v.missions.fleets = [structuredClone(fleet)]
    expect(galaxyFlights(s, at)).toEqual([
      { id: 'fleet', mission: 'Espionage', phase: 'en route', dueAt: 31000 },
    ])
    expect(
      galaxyFlights(s, { ...at, body: { ...at.body!, id: 'replacement' } }),
    ).toEqual([])
    v.missions.fleets[0].leg = 'Returning'
    v.missions.fleets[0].due_at = 61000
    expect(galaxyFlights(s, at)).toEqual([])
    expect(
      galaxyFlights(s, { ...at, body: { ...at.body!, id: 'body' } }),
    ).toEqual([
      { id: 'fleet', mission: 'Espionage', phase: 'returning', dueAt: 61000 },
    ])
    v.missions.fleets = []
    expect(galaxyFlights(s, at)).toEqual([])
  })

  it('derives uncertain departures and probe reservations, then removes rejected or reconciled overlays', () => {
    const s = spyState()
    const attempt = intent(s, command, terms)
    attempt.status = 'uncertain'
    expect(pendingProbe(s, 'body', 'target')).toBe(true)
    expect(galaxyFlights(s, at)).toEqual([
      {
        id: 'command',
        mission: 'Espionage',
        phase: 'departure pending',
        dueAt: null,
      },
    ])
    expect(probeAvailability(s, 'body')).toBeNull()
    s.view!.bodies[0].inventories.at(-1)!.count = '1'
    expect(probeAvailability(s, 'body')).toContain('No espionage probes')
    attempt.status = 'rejected'
    expect(galaxyFlights(s, at)).toEqual([])
    expect(pendingProbe(s, 'body', 'target')).toBe(false)
    expect(probeAvailability(s, 'body')).toBeNull()
    attempt.status = 'committed'
    attempt.reconciled = true
    ;(s.view as S['BoundView4']).missions.fleets = [fleet]
    expect(galaxyFlights(s, at)).toHaveLength(1)
  })

  it('matches colonization and debris destinations by complete coordinates', () => {
    const s = spyState(),
      v = s.view as S['BoundView4']
    for (const destination of [
      {
        type: 'EmptyPosition',
        coordinates: at.coordinates,
        slot_revision: '1',
      },
      { type: 'Debris', coordinates: at.coordinates, field_identity: 'debris' },
    ] as S['MissionDestination4'][]) {
      v.missions.fleets = [{ ...fleet, intent: { ...spyIntent, destination } }]
      expect(galaxyFlights(s, at)).toHaveLength(1)
      expect(
        galaxyFlights(s, {
          ...at,
          coordinates: { ...at.coordinates, system: 2 },
        }),
      ).toEqual([])
    }
  })

  it('sends one probe at full speed with no cargo using the server quote and durable command path', async () => {
    const store = createGameStore()
    store.setState(spyState())
    const model = {
      store,
      world: vi.fn(async () => terms),
      send: vi.fn(async () => 'command'),
    }
    await sendGalaxyProbe(model, 'body', at.body!, () => true)
    expect(model.world).toHaveBeenCalledExactlyOnceWith({
      type: 'FleetQuote',
      intent: spyIntent,
    })
    expect(model.send).toHaveBeenCalledExactlyOnceWith(command, terms)
  })

  it('does not send after navigation or a binding change while quoting', async () => {
    const store = createGameStore()
    store.setState(spyState())
    let current = true
    const model = {
      store,
      world: vi.fn(async () => {
        current = false
        return terms
      }),
      send: vi.fn(async () => 'command'),
    }
    await sendGalaxyProbe(model, 'body', at.body!, () => current)
    expect(model.send).not.toHaveBeenCalled()
    current = true
    model.world.mockImplementation(async () => {
      store.setState({
        binding: { ...store.getState().binding!, epoch: 'new' },
      })
      return terms
    })
    await sendGalaxyProbe(model, 'body', at.body!, () => true)
    expect(model.send).not.toHaveBeenCalled()
  })

  it('blocks absent probes, full slots, duplicate pending probes and failed quotes without sending', async () => {
    const store = createGameStore()
    const s = spyState()
    store.setState(s)
    const model = {
      store,
      world: vi.fn(async () => terms),
      send: vi.fn(async () => 'command'),
    }
    s.view!.bodies[0].inventories.at(-1)!.count = '0'
    await expect(
      sendGalaxyProbe(model, 'body', at.body!, () => true),
    ).rejects.toThrow('No espionage probes')
    expect(model.world).not.toHaveBeenCalled()
    s.view!.bodies[0].inventories.at(-1)!.count = '2'
    ;(s.view as S['BoundView4']).missions.fleet_slots = '0'
    await expect(
      sendGalaxyProbe(model, 'body', at.body!, () => true),
    ).rejects.toThrow('All fleet slots')
    ;(s.view as S['BoundView4']).missions.fleet_slots = '3'
    intent(s, command, terms)
    store.setState(s)
    await sendGalaxyProbe(model, 'body', at.body!, () => true)
    expect(model.world).not.toHaveBeenCalled()
    store.setState(spyState())
    model.world.mockRejectedValue(new Error('InsufficientResources'))
    await expect(
      sendGalaxyProbe(model, 'body', at.body!, () => true),
    ).rejects.toThrow('not enough resources')
    expect(model.send).not.toHaveBeenCalled()
  })
})
