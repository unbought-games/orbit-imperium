import { expect, it } from 'vitest'
import { bootstrapFixture } from '../../test-support/bootstrap'
import { createGameStore } from '../../client-model/game-store'
import type { components } from '../../contracts'
import {
  captionEvents,
  initialCaptionEvents,
  lostSpyProbes,
} from './caption-events'
type Header = components['schemas']['ReportHeader4']
const at = { galaxy: 1, system: 2, position: 3 }
function fixture() {
  const { result } = bootstrapFixture(4)
  if (result.status !== 'authenticated' || result.game.status !== 'ready')
    throw Error('Fixture not ready')
  const view = result.game.snapshot.view
  return {
    ...createGameStore().getState(),
    view,
    binding: view.binding,
    ready: true,
    reportInbox: { items: [], has_more: false, next_cursor: null, as_of_ms: 1 },
  }
}
const header = (id: string, preview: Header['preview']): Header => ({
  id,
  kind: preview!.kind,
  preview,
  read: false,
  hidden: false,
  observed_at: 1000,
})
it('requires an actual lost espionage fleet and the viewer must be the attacker', () => {
  const state = fixture()
  const preview: Header['preview'] = {
    kind: 'Combat',
    mission: 'Espionage',
    outcome: 'DefenderVictory',
    participants: [{ owner: state.binding.player, side: 'Attacker' }],
  }
  expect(lostSpyProbes(header('loss', preview), state)).toBe(true)
  expect(
    lostSpyProbes(header('loss', { ...preview, outcome: 'Draw' }), state),
  ).toBe(false)
  expect(
    lostSpyProbes(header('loss', { ...preview, mission: 'Attack' }), state),
  ).toBe(false)
  expect(
    lostSpyProbes(
      header('loss', {
        ...preview,
        participants: [{ owner: state.binding.player, side: 'Defender' }],
      }),
      state,
    ),
  ).toBe(false)
  expect(
    lostSpyProbes(
      header('spy', {
        kind: 'Espionage',
        counterespionage: { detected: true, probability_ppm: 1000000 },
      }),
      state,
    ),
  ).toBe(false)
})
it('restricted ContactLost needs lost probes and a matching detected spy observation', () => {
  const state = fixture()
  const lost = header('lost', {
    kind: 'ContactLost',
    target: at,
    own_lost_ships: [{ ship_type: 'EspionageProbe', count: '2' }],
  })
  expect(lostSpyProbes(lost, state)).toBe(false)
  const spy = header('spy', {
    kind: 'Espionage',
    target: { body: 'body', owner: 'enemy', kind: 'Planet', coordinates: at },
    counterespionage: { detected: true, probability_ppm: 1000000 },
  })
  state.reportHeaders.set('spy', { header: spy, revision: '1' })
  expect(lostSpyProbes(lost, state)).toBe(true)
  expect(lostSpyProbes({ ...lost, observed_at: 999 }, state)).toBe(false)
  expect(
    lostSpyProbes(
      header('lost', {
        kind: 'ContactLost',
        target: at,
        own_lost_ships: [{ ship_type: 'SmallCargo', count: '2' }],
      }),
      state,
    ),
  ).toBe(false)
})
it('new loss reports emit the specific event; hydration, pagination and later reads do not replay it', () => {
  const before = fixture()
  const lost = header('loss', {
    kind: 'Combat',
    mission: 'Espionage',
    outcome: 'DefenderVictory',
    participants: [{ owner: before.binding.player, side: 'Attacker' }],
  })
  const after = {
    ...before,
    reportHeaders: new Map([['loss', { header: lost, revision: '2' }]]),
    reportInbox: { ...before.reportInbox, items: ['loss'] },
  }
  expect(captionEvents(before, after)).toContainEqual({
    id: 'report:loss',
    kind: 'probe.destroyed',
  })
  expect(
    captionEvents({ ...before, reportInbox: null }, after),
  ).not.toContainEqual({ id: 'report:loss', kind: 'probe.destroyed' })
  expect(
    captionEvents(after, { ...after, reportInbox: { ...after.reportInbox } }),
  ).toEqual([])
  expect(
    captionEvents(before, { ...after, reportInbox: before.reportInbox }),
  ).not.toContainEqual({ id: 'report:loss', kind: 'probe.destroyed' })
  expect(initialCaptionEvents(after)).toEqual([
    { id: 'initial:ready', kind: 'unread' },
  ])
})
