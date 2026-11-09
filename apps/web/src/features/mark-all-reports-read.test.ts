import { expect, it, vi } from 'vitest'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import { mergeReportHeaders } from '../client-model/report-state'
import { markAllReportsRead } from './mark-all-reports-read'

function fixture() {
  const store = createGameStore()
  const { snapshot } = readyFixture(4)
  store.setState({
    binding: snapshot.candidate.binding,
    view: snapshot.view,
    ready: true,
  })
  const headers = Array.from({ length: 78 }, (_, index) => ({
    id: String(index),
    kind: 'Espionage',
    observed_at: index,
    read: index === 0,
    hidden: index === 77,
    starred: index === 76,
    shared: index === 76,
  }))
  const reportPage = vi.fn(
    async (cursor: string | null, includeHidden: boolean) => {
      expect(includeHidden).toBe(true)
      const start = Number(cursor ?? 0)
      const items = headers.slice(start, start + 20)
      store.setState({
        reportHeaders: mergeReportHeaders(
          store.getState().reportHeaders,
          items,
          '1',
        ),
      })
      return {
        items,
        has_more: start + 20 < headers.length,
        next_cursor: start + 20 < headers.length ? String(start + 20) : null,
        as_of_ms: 0,
      }
    },
  )
  const send = vi.fn(async () => 'submitted')
  return { store, reportPage, send, headers }
}
it('reads every cursor page before one read-only batch, including archived and shared starred reports', async () => {
  const model = fixture()
  await markAllReportsRead(model)
  expect(model.reportPage.mock.calls.map((call) => call[0])).toEqual([
    null,
    '20',
    '40',
    '60',
  ])
  expect(model.send.mock.calls).toEqual([
    [
      {
        type: 'World',
        action: {
          type: 'MarkReportsRead',
          reports: model.headers.slice(1).map((row) => row.id),
        },
      },
    ],
  ])
  expect(model.store.getState().reportHeaders.get('76')?.header).toMatchObject({
    starred: true,
    shared: true,
  })
  expect(model.store.getState().reportHeaders.get('77')?.header.hidden).toBe(
    true,
  )
})
it('never submits a partial batch after a later page failure', async () => {
  const model = fixture()
  model.reportPage
    .mockImplementationOnce(async () => ({
      items: model.headers.slice(0, 20),
      has_more: true,
      next_cursor: '20',
      as_of_ms: 0,
    }))
    .mockRejectedValueOnce(new Error('offline'))
  await expect(markAllReportsRead(model)).rejects.toThrow('offline')
  expect(model.send).not.toHaveBeenCalled()
})
it('stops when context changes while reading a page', async () => {
  const model = fixture()
  model.reportPage.mockImplementationOnce(async () => {
    model.store.setState({
      binding: { ...model.store.getState().binding!, player: 'another-player' },
    })
    return {
      items: model.headers,
      has_more: false,
      next_cursor: null,
      as_of_ms: 0,
    }
  })
  await expect(markAllReportsRead(model)).rejects.toThrow('context changed')
  expect(model.send).not.toHaveBeenCalled()
})
it.each([null, 'repeated'])(
  'refuses an incomplete or repeating cursor (%s)',
  async (cursor) => {
    const model = fixture()
    model.reportPage.mockResolvedValue({
      items: [],
      has_more: true,
      next_cursor: cursor,
      as_of_ms: 0,
    })
    await expect(markAllReportsRead(model)).rejects.toThrow(
      'Incomplete report history',
    )
    expect(model.reportPage.mock.calls.length).toBeLessThanOrEqual(2)
    expect(model.send).not.toHaveBeenCalled()
  },
)
it('does not send a command when everything is read', async () => {
  const model = fixture()
  model.headers.forEach((header) => {
    header.read = true
  })
  await markAllReportsRead(model)
  expect(model.send).not.toHaveBeenCalled()
})
