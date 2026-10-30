import { expect, it, vi } from 'vitest'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import { mergeReportHeaders } from '../client-model/report-state'
import { changeReportSelection } from './report-cleanup'
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
it('submits one batch, deduplicating IDs and rechecking live protection', async () => {
  const store = fixture()
  const send = vi.fn(async () => 'submitted')
  await changeReportSelection({ store, send }, ['a', 'b', 'c', 'missing', 'a'])
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'World',
    action: { type: 'SetReportsHidden', reports: ['a', 'c'], hidden: true },
  })
})
it('skips missing, starred and already hidden reports without sending an empty batch', async () => {
  const store = fixture()
  store.setState((s) => ({
    reportHeaders: mergeReportHeaders(
      s.reportHeaders,
      [{ ...s.reportHeaders.get('a')!.header, hidden: true }],
      '2',
    ),
  }))
  const send = vi.fn(async () => 'submitted')
  await changeReportSelection({ store, send }, ['a', 'b', 'missing'])
  expect(send).not.toHaveBeenCalled()
})
it('reports refused submission without claiming cleanup succeeded', async () => {
  const store = fixture(),
    send = vi.fn(async () => undefined)
  await expect(
    changeReportSelection({ store, send }, ['a', 'c']),
  ).rejects.toThrow('not submitted')
  expect(send).toHaveBeenCalledTimes(1)
})
it('does not submit when the report context is no longer ready', async () => {
  const store = fixture(),
    send = vi.fn(async () => 'submitted')
  store.setState({ ready: false })
  await expect(
    changeReportSelection({ store, send }, ['a', 'c']),
  ).rejects.toThrow('context changed')
  expect(send).not.toHaveBeenCalled()
})

it('restores archived selections, including starred reports, without touching inbox rows', async () => {
  const store = fixture()
  store.setState((s) => ({
    reportHeaders: mergeReportHeaders(
      s.reportHeaders,
      ['a', 'b'].map((id) => ({
        ...s.reportHeaders.get(id)!.header,
        hidden: true,
      })),
      '2',
    ),
  }))
  const send = vi.fn(async () => 'submitted')
  await changeReportSelection({ store, send }, ['a', 'b', 'c', 'a'], false)
  expect(send).toHaveBeenCalledExactlyOnceWith({
    type: 'World',
    action: { type: 'SetReportsHidden', reports: ['a', 'b'], hidden: false },
  })
})
