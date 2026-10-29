import { readyFixture, memoryStorage } from '../test-support/bootstrap'
import { attemptStorage } from '../adapters/attempt-storage'
import { expect, it, vi } from 'vitest'
import { Coordinator } from './coordinator'
import type {
  Attempt,
  AttemptStorage,
  Binding,
  Envelope,
  GamePort,
  ClientPlatform,
} from './commands'
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const binding: Binding = {
  account: id(1),
  player: id(2),
  universe: id(3),
  epoch: id(4),
}
it.each(['Production', 'Attack'] as const)(
  'recovers the same protocol-4 %s presence/gameplay pair after a lost response; passive polling creates none',
  async (action) => {
    let n = 10,
      lose = true
    const sent: Envelope[] = [],
      saved = new Map<string, Attempt>()
    const storage: AttemptStorage = {
      async load() {
        return [...saved.values()]
      },
      async put(a) {
        saved.set(a.envelope.command_id, structuredClone(a))
      },
      async remove(_, id) {
        saved.delete(id)
      },
      async clear() {
        saved.clear()
      },
    }
    const port: GamePort = {
      async currentBinding(_, request_id) {
        return { protocol: 4, binding, request_id, sampled_at: 1000 }
      },
      async settings(c) {
        return {
          protocol: 4,
          binding,
          request_id: c.request_id,
          profile_hash: 'a'.repeat(64),
          profile_id: action === 'Attack' ? 'mvp-v1-slice-5' : 'mvp-v1-slice-4',
          speed: 10,
          galaxies: 1,
          systems_per_galaxy: 5,
          positions_per_system: 15,
        }
      },
      async view(c) {
        return {
          protocol: 4,
          binding,
          request_id: c.request_id,
          viewer_revision: '0',
          sampled_at: 1000,
          as_of_ms: 1000,
          profile_hash: 'a'.repeat(64),
          speed: 10,
          bodies: [],
          research: [],
          catalog: [],
          capabilities: [],
          constructions: [],
          fleets: [],
          reports: [],
          destinations: [],
          reports_truncated: false,
          destinations_truncated: false,
          progression: {
            production: [],
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
      },
      async quote() {
        throw Error('unused')
      },
      async submit(e) {
        sent.push(structuredClone(e))
        if (lose) throw Error('lost response')
        return {
          protocol: 4,
          binding,
          command_id: e.command_id,
          admitted_at: 1000,
          executed_at: null,
          status: 'Pending',
        }
      },
      async receipt() {
        throw { status: 404, code: 'NotFound' }
      },
    }
    let timeout: (() => void) | undefined
    const platform: ClientPlatform = {
      scheduleOnce: (callback) => {
        timeout = callback
        return () => {
          timeout = undefined
        }
      },
      newId: () => id(n++),
      monotonicNowMs: () => 1000,
      isOnline: () => true,
    }
    const first = new Coordinator(port, storage, platform)
    await first.connect(binding.account, binding.universe)
    await first.poll()
    expect(sent).toHaveLength(0)
    await first.send(
      action === 'Attack'
        ? {
            type: 'World',
            action: {
              type: 'LaunchFleet',
              expected_terms_hash: 'a'.repeat(64),
              intent: {
                origin: id(5),
                destination: {
                  type: 'Body',
                  id: id(6),
                  expected_kind: 'Planet',
                  expected_owner: id(7),
                },
                mission: 'Attack',
                ships: [
                  {
                    owner: binding.player,
                    ship_type: 'SmallCargo',
                    count: '1',
                  },
                ],
                cargo: { metal: '0', crystal: '0', deuterium: '0' },
                speed_percent: 100,
              },
            },
          }
        : {
            type: 'SetProduction',
            body: id(5),
            settings: {
              metal_mine: 50,
              crystal_mine: 100,
              deuterium_synthesizer: 100,
              solar_plant: 100,
              fusion_reactor: 100,
              solar_satellite: 100,
            },
            expected_settings_revision: '0',
          },
    )
    expect(sent).toHaveLength(1)
    const envelope = sent[0]
    expect(envelope.protocol).toBe(4)
    if (envelope.protocol !== 4) throw Error('wrong protocol')
    expect(envelope.presence?.command_id).not.toBe(envelope.command_id)
    expect(envelope.presence?.command).toEqual({
      type: 'World',
      action: {
        type: 'RecordForegroundPresence',
        body: id(5),
        cause: 'GameplayGesture',
        paired_command_id: envelope.command_id,
      },
    })
    first.invalidate()
    lose = false
    const restored = new Coordinator(port, storage, platform)
    await restored.connect(binding.account, binding.universe)
    await restored.recover(envelope.command_id)
    expect(
      sent
        .slice(1)
        .every((e) => JSON.stringify(e) === JSON.stringify(envelope)),
    ).toBe(true)
    expect([...saved.values()][0].envelope).toEqual(envelope)
    let readCalls = 0
    port.world = async (context) => {
      readCalls++
      if (readCalls === 1) throw { status: 503, code: 'Unavailable' }
      return {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '0',
        sampled_at: 1000,
        as_of_ms: 1000,
        data: {
          type: 'Body',
          id: id(5),
          expected_kind: 'Planet',
          expected_owner: id(6),
        },
      }
    }
    const beforeCommands = sent.length
    const read = restored
      .world({
        type: 'ResolveDestination',
        selection: {
          type: 'BodyAt',
          coordinates: { galaxy: 1, system: 1, position: 8 },
          kind: 'Planet',
        },
      })
      .catch(() => null)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await restored.refresh()
    expect(await read).toMatchObject({ type: 'Body', id: id(5) })
    expect(readCalls).toBe(2)
    expect(sent).toHaveLength(beforeCommands)
    port.world = async () => {
      throw { status: 503, code: 'Unavailable', retryAfterMs: 60000 }
    }
    const blocked = restored
      .world({ type: 'Galaxy', galaxy: 1, system: 1 })
      .catch(() => null)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(typeof timeout).toBe('function')
    timeout?.()
    expect(await blocked).toBeNull()
    port.world = async (context) => ({
      protocol: 4,
      binding,
      request_id: context.request_id,
      viewer_revision: '0',
      sampled_at: 1000,
      as_of_ms: 1000,
      data: {
        type: 'Body',
        id: id(5),
        expected_kind: 'Planet',
        expected_owner: id(6),
      },
    })
    const mismatched = await restored.world({
      type: 'FleetQuote',
      intent: {
        origin: id(5),
        destination: {
          type: 'Body',
          id: id(6),
          expected_kind: 'Planet',
          expected_owner: id(7),
        },
        mission: 'Transport',
        ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '1' }],
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      },
    })
    expect(mismatched).toBeNull()
  },
)

it.each([false, true])(
  'checks saved presence after an outage without automatically resending (reload=%s)',
  async (reload) => {
    vi.useFakeTimers()
    const { session, snapshot } = readyFixture(4)
    const storage = attemptStorage(memoryStorage())
    const sent: Envelope[] = []
    let available = false
    let receiptConfirmed = false
    const port: GamePort = {
      currentBinding: async (_, request_id) => ({
        ...snapshot.candidate,
        request_id,
      }),
      settings: async (context) => ({
        ...snapshot.settings,
        request_id: context.request_id,
      }),
      view: async (context) => {
        if (!available) throw { status: 503 }
        return { ...snapshot.view, request_id: context.request_id }
      },
      quote: async () => {
        throw Error('unused')
      },
      submit: async (envelope) => {
        sent.push(structuredClone(envelope))
        if (!available) throw { status: 503 }
        return {
          protocol: 4,
          binding: envelope.binding,
          command_id: envelope.command_id,
          status: 'Committed',
          admitted_at: 1000,
          executed_at: 1000,
          result_ids: [],
          minimum_viewer_revision: '0',
        }
      },
      receipt: async () => {
        if (!receiptConfirmed) throw { status: available ? 404 : 503 }
        return {
          protocol: 4,
          binding: sent[0].binding,
          command_id: sent[0].command_id,
          status: 'Committed',
          admitted_at: 1000,
          executed_at: 1000,
          result_ids: [],
          minimum_viewer_revision: '0',
        }
      },
    }
    const platform: ClientPlatform = {
      newId: () => crypto.randomUUID(),
      monotonicNowMs: () => Date.now(),
      isOnline: () => true,
      random: () => 0,
      scheduleOnce: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      },
    }
    let model = new Coordinator(port, storage, platform)
    let stop = () => {}
    try {
      await model.initialize(session, snapshot)
      await model.recordPresence('BodyVisit', null)
      const envelope = sent[0]
      expect([...model.ledger.values()][0].status).toBe('uncertain')
      if (reload) {
        model.invalidate()
        model = new Coordinator(port, storage, platform)
        await model.initialize(session, snapshot)
      }
      stop = model.startDelivery()
      await vi.advanceTimersByTimeAsync(30000)
      expect(sent).toHaveLength(1)
      expect(await storage.load(snapshot.candidate.binding)).toHaveLength(1)
      available = true
      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toEqual([envelope])
      expect([...model.ledger.values()][0].status).toBe('uncertain')
      // The original request can still be acknowledged after a missing receipt.
      receiptConfirmed = true
      await vi.advanceTimersByTimeAsync(1000)
      expect(sent).toEqual([envelope])
      expect(model.stale).toBe(false)
      expect(model.ledger.size).toBe(0)
      expect(await storage.load(snapshot.candidate.binding)).toEqual([])
      await vi.advanceTimersByTimeAsync(60000)
      expect(sent).toHaveLength(1)
    } finally {
      stop()
      model.invalidate()
      vi.useRealTimers()
    }
  },
)
