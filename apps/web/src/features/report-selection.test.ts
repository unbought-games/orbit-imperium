import { expect, it, vi } from 'vitest'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import { mergeReportHeaders } from '../client-model/report-state'
import {
  markReportSelectionRead,
  toggleReportSelection,
} from './report-selection'

it('selects and deselects inclusive ranges in current display order without changing other selections', () => {
  const order = ['d', 'b', 'c', 'a']
  const initial = new Set(['outside', 'd'])
  const selected = toggleReportSelection(initial, order, 'c', true, 'd')
  expect([...selected]).toEqual(['outside', 'd', 'b', 'c'])
  expect([...initial]).toEqual(['outside', 'd'])
  expect([...toggleReportSelection(selected, order, 'd', false, 'c')]).toEqual([
    'outside',
  ])
  expect([...toggleReportSelection(new Set(), order, 'b', true, 'a')]).toEqual([
    'b',
    'c',
    'a',
  ])
})

it('toggles only the clicked row without an anchor or when the anchor was filtered out', () => {
  for (const anchor of [null, 'missing']) {
    expect([
      ...toggleReportSelection(
        new Set(['a']),
        ['a', 'b', 'c'],
        'c',
        true,
        anchor,
      ),
    ]).toEqual(['a', 'c'])
  }
})

function fixture() {
  const store = createGameStore()
  const { snapshot } = readyFixture(4)
  store.setState({
    binding: snapshot.candidate.binding,
    view: snapshot.view,
    ready: true,
    reportHeaders: mergeReportHeaders(
      new Map(),
      ['a', 'b', 'c'].map((id) => ({
        id,
        kind: 'Espionage',
        observed_at: 0,
        hidden: id === 'c',
        read: id === 'a',
        starred: id === 'b',
      })),
      '1',
    ),
  })
  return store
}

it('marks unread selections including starred and archived reports, skipping duplicates and missing or read reports', async () => {
  const store = fixture()
  const send = vi.fn(async () => 'submitted')
  await markReportSelectionRead({ store, send }, [
    'a',
    'b',
    'b',
    'missing',
    'c',
  ])
  expect(send.mock.calls).toEqual([
    [{ type: 'World', action: { type: 'MarkReportRead', report: 'b' } }],
    [{ type: 'World', action: { type: 'MarkReportRead', report: 'c' } }],
  ])
})

it('stops on a refused submission instead of continuing through the selection', async () => {
  const store = fixture()
  const send = vi.fn(async () => undefined)
  await expect(
    markReportSelectionRead({ store, send }, ['b', 'c']),
  ).rejects.toThrow('not submitted')
  expect(send).toHaveBeenCalledTimes(1)
})

it('rechecks live read state between sequential commands', async () => {
  const store = fixture()
  const send = vi.fn(async () => {
    store.setState((s) => ({
      reportHeaders: mergeReportHeaders(
        s.reportHeaders,
        [{ ...s.reportHeaders.get('c')!.header, read: true }],
        '2',
      ),
    }))
    return 'submitted'
  })
  await markReportSelectionRead({ store, send }, ['b', 'c'])
  expect(send).toHaveBeenCalledTimes(1)
})

it('stops the batch if the player context changes', async () => {
  const store = fixture()
  const send = vi.fn(async () => {
    store.setState({
      binding: { ...store.getState().binding!, player: 'different-player' },
    })
    return 'submitted'
  })
  await expect(
    markReportSelectionRead({ store, send }, ['b', 'c']),
  ).rejects.toThrow('context changed')
  expect(send).toHaveBeenCalledTimes(1)
})
