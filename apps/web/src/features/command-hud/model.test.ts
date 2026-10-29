import { describe, expect, it } from 'vitest'
import { bootstrapFixture } from '../../test-support/bootstrap'
import { createGameStore } from '../../client-model/game-store'
import type {
  Attempt,
  BoundReceipt,
  Command,
} from '../../client-model/commands'
import {
  changedHudTargets,
  hasUnreadIntelligence,
  unreadBadgeCount,
  incomingKey,
  noticeContent,
  orbAppearance,
} from './model'
import { occupiedFleetSlots } from '../../client-model/game-projection'
function fixture() {
  const { result } = bootstrapFixture(4)
  if (result.status !== 'authenticated' || result.game.status !== 'ready')
    throw Error('Fixture not ready')
  const view = result.game.snapshot.view
  if (view.protocol !== 4) throw Error('Expected protocol 4')
  return {
    ...createGameStore().getState(),
    binding: view.binding,
    view,
    ready: true,
  }
}
function attempt(
  command: Command,
  status: Attempt['status'] = 'committed',
): Extract<Attempt, { envelope: { protocol: 4 } }> {
  const binding = fixture().binding
  return {
    envelope: {
      protocol: 4,
      binding,
      command_id: 'command',
      presence: null,
      command,
    },
    status,
    receipt: null,
    reconciled: false,
  }
}
describe('live HUD sources', () => {
  it('announces each real committed gameplay transition once, never pending, failed or restored history', () => {
    const before = fixture()
    const action = attempt({
      type: 'StartUpgrade',
      body: 'body',
      building: 'MetalMine',
      expected_terms_hash: 'hash',
    })
    expect(
      changedHudTargets(before, {
        ...before,
        attempts: new Map([['a', action]]),
      }),
    ).toEqual([])
    before.attempts = new Map([['a', { ...action, status: 'submitting' }]])
    for (const status of ['pending', 'uncertain', 'rejected'] as const)
      expect(
        changedHudTargets(before, {
          ...before,
          attempts: new Map([['a', { ...action, status }]]),
        }),
      ).toEqual([])
    const after = { ...before, attempts: new Map([['a', action]]) }
    expect(changedHudTargets(before, after)).toEqual([
      { kind: 'command', id: 'a' },
    ])
    expect(changedHudTargets(after, after)).toEqual([])
    expect(noticeContent(after, { kind: 'command', id: 'a' })?.title).toBe(
      'Construction started',
    )
  })
  it('keeps incoming warnings until server removal, and uses only visible ship intelligence', () => {
    const state = fixture()
    const fleet = {
      sender: 'enemy',
      origin: { galaxy: 1, system: 2, position: 3 },
      target: 'home',
      mission: 'Attack' as const,
      arrival_at: 0,
      ships: { visibility: 'Unknown' as const },
    }
    const before = { ...state, view: structuredClone(state.view) }
    state.view.missions.incoming = [fleet]
    expect(changedHudTargets(before, state)).toEqual([
      { kind: 'incoming', id: incomingKey(fleet) },
    ])
    expect(orbAppearance({ ...state, stale: true }, []).tone).toBe('red')
    expect(
      noticeContent(state, { kind: 'incoming', id: incomingKey(fleet) })
        ?.detail,
    ).toContain('Ship composition unknown')
    state.view.missions.incoming = []
    expect(orbAppearance(state, []).tone).toBe('ice')
  })
  it('hydrates unread silently, then toasts new inbox reports, not historical detail loads', () => {
    const before = fixture()
    const report = {
      id: 'report',
      kind: 'Espionage',
      observed_at: 1,
      hidden: false,
      read: false,
    }
    const first = {
      ...before,
      reportInbox: {
        items: ['report'],
        has_more: false,
        next_cursor: null,
        as_of_ms: 1,
      },
      reportHeaders: new Map([['report', { header: report, revision: '1' }]]),
    }
    expect(changedHudTargets(before, first)).toEqual([])
    expect(hasUnreadIntelligence(first)).toBe(true)
    const next = {
      ...first,
      reportHeaders: new Map(first.reportHeaders).set('new', {
        header: { ...report, id: 'new' },
        revision: '2',
      }),
    }
    expect(changedHudTargets(first, next)).toEqual([])
    expect(
      changedHudTargets(first, {
        ...next,
        reportInbox: { ...first.reportInbox, items: ['new', 'report'] },
      }),
    ).toEqual([{ kind: 'report', id: 'new' }])
    const empty = {
      ...before,
      reportInbox: { ...first.reportInbox, items: [] },
    }
    expect(changedHudTargets(empty, first)).toEqual([
      { kind: 'report', id: 'report' },
    ])
  })
  it('treats historical and newly received spy contacts as regular unread intelligence', () => {
    const state = fixture()
    const header = {
      id: 'contact',
      kind: 'SpyContact',
      observed_at: 1,
      read: false,
      hidden: false,
    }
    state.reportHeaders.set(header.id, { header, revision: '1' })
    expect(orbAppearance(state, [])).toEqual({
      tone: 'champagne',
      icon: 'message',
    })
    expect(unreadBadgeCount(state)).toBe(1)
    const target = { kind: 'report' as const, id: header.id }
    expect(noticeContent(state, target)).toMatchObject({
      tone: 'champagne',
      icon: 'scan',
    })
    expect(orbAppearance(state, [{ ...target, shownAt: state.now }])).toEqual({
      tone: 'champagne',
      icon: 'message',
    })
    for (const dismissed of [
      { read: true, hidden: false },
      { read: false, hidden: true },
    ]) {
      state.reportHeaders.set(header.id, {
        header: { ...header, ...dismissed },
        revision: '2',
      })
      expect(orbAppearance(state, []).tone).toBe('ice')
      expect(unreadBadgeCount(state)).toBe(0)
    }
  })
  it('reserves red for active attacks even when probes arrive later', () => {
    const state = fixture()
    const probe = {
      sender: 'enemy',
      origin: { galaxy: 1, system: 2, position: 3 },
      target: 'home',
      mission: 'Espionage' as const,
      arrival_at: 9000,
      ships: { visibility: 'Unknown' as const },
    }
    state.view.missions.incoming = [probe]
    const target = { kind: 'incoming' as const, id: incomingKey(probe) }
    expect(noticeContent(state, target)).toMatchObject({
      tone: 'champagne',
      icon: 'scan',
    })
    expect(orbAppearance(state, []).tone).toBe('ice')
    const attack = { ...probe, mission: 'Attack' as const }
    state.view.missions.incoming = [attack, probe]
    expect(orbAppearance(state, [])).toEqual({ tone: 'red', icon: 'attack' })
    expect(
      noticeContent(state, { kind: 'incoming', id: incomingKey(attack) })?.tone,
    ).toBe('red')
    state.reportHeaders.set('contact', {
      header: {
        id: 'contact',
        kind: 'SpyContact',
        observed_at: 1,
        read: false,
        hidden: false,
      },
      revision: '1',
    })
    state.view.missions.incoming = [probe]
    expect(orbAppearance(state, [])).toEqual({
      tone: 'champagne',
      icon: 'message',
    })
  })
  it('uses authoritative fleet timing and shared slots; never invents an arrival before the snapshot', () => {
    const state = fixture()
    const intent = {
      origin: 'home',
      destination: {
        type: 'EmptyPosition' as const,
        slot_revision: '1',
        coordinates: { galaxy: 1, system: 2, position: 3 },
      },
      mission: 'Colonize' as const,
      ships: [],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100 as const,
    }
    const a = attempt({
      type: 'World',
      action: { type: 'LaunchFleet', intent, expected_terms_hash: 'hash' },
    })
    state.attempts.set('a', a)
    expect(occupiedFleetSlots(state)).toBe(1)
    expect(
      noticeContent(state, { kind: 'command', id: 'a' })?.deadline,
    ).toBeUndefined()
    const receipt: BoundReceipt = {
      protocol: 4,
      binding: state.binding,
      command_id: 'command',
      status: 'Committed',
      admitted_at: 1,
      executed_at: 1,
      result_ids: ['fleet'],
      minimum_viewer_revision: state.view.viewer_revision,
    }
    state.attempts.set('a', { ...a, receipt, reconciled: true })
    state.view.missions.fleets = [
      {
        id: 'fleet',
        intent,
        origin: { galaxy: 1, system: 1, position: 1 },
        destination: { galaxy: 1, system: 2, position: 3 },
        leg: 'Outbound',
        ships: [],
        cargo: intent.cargo,
        due_at: 9000,
        launched_at: 1000,
        duration_ms: 8000,
        paid_fuel: '0',
        can_recall: true,
      },
    ]
    expect(occupiedFleetSlots(state)).toBe(1)
    expect(noticeContent(state, { kind: 'command', id: 'a' })?.deadline).toBe(
      9000,
    )
  })
})

it('derives a capped unread badge from visible unread intelligence only', () => {
  const state = fixture()
  expect(unreadBadgeCount(state)).toBe(0)
  for (let i = 0; i < 120; i++)
    state.reportHeaders.set(String(i), {
      revision: '1',
      header: {
        id: String(i),
        kind: 'Espionage',
        observed_at: i,
        read: false,
        hidden: false,
      },
    })
  expect(unreadBadgeCount(state)).toBe(99)
  for (const [id, entry] of state.reportHeaders)
    state.reportHeaders.set(id, {
      ...entry,
      header: { ...entry.header, read: Number(id) > 1, hidden: id === '0' },
    })
  expect(unreadBadgeCount(state)).toBe(1)
})
