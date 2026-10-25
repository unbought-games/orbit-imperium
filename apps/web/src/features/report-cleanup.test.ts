import { expect, it, vi } from 'vitest'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import { mergeReportHeaders } from '../client-model/report-state'
import { deleteReportSelection } from './report-cleanup'
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
        hidden: false,
        read: false,
        starred: id === 'b',
      })),
      '1',
    ),
  })
  return store
}
it('rechecks live stars and skips missing reports between individual submissions', async () => {
  const store = fixture()
  const send = vi.fn(async () => {
    store.setState((s) => ({
      reportHeaders: mergeReportHeaders(
        s.reportHeaders,
        [{ ...s.reportHeaders.get('c')!.header, starred: true }],
        '2',
      ),
    }))
    return 'submitted'
  })
  await deleteReportSelection({ store, send }, ['a', 'b', 'c', 'missing'])
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'World',
    action: { type: 'SetReportHidden', report: 'a', hidden: true },
  })
})
it('stops on refused submission instead of silently losing the remaining selection', async () => {
  const store = fixture(),
    send = vi.fn(async () => undefined)
  await expect(
    deleteReportSelection({ store, send }, ['a', 'c']),
  ).rejects.toThrow('not submitted')
  expect(send).toHaveBeenCalledTimes(1)
})
it('never sends the remaining selection under another account or universe binding', async () => {
  const store = fixture()
  const send = vi.fn(async () => {
    store.setState((s) => ({
      binding: { ...s.binding!, universe: 'another-universe' },
    }))
    return 'submitted'
  })
  await expect(
    deleteReportSelection({ store, send }, ['a', 'c']),
  ).rejects.toThrow('context changed')
  expect(send).toHaveBeenCalledTimes(1)
})
