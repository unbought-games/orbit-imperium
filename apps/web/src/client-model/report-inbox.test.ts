import { expect, it, vi } from 'vitest'
import { readReportInbox, extendReportInbox } from './report-inbox'
import type { BoundReports } from './commands'

const header = (id: string, read = false) => ({
  id,
  kind: 'Espionage',
  read,
  hidden: false,
  observed_at: 1,
})
const page = (
  items: ReturnType<typeof header>[],
  next: string | null = null,
  revision = '1',
): BoundReports => ({
  protocol: 4,
  binding: {
    account: 'account',
    universe: 'universe',
    player: 'player',
    epoch: 'epoch',
  },
  request_id: 'request',
  viewer_revision: revision,
  sampled_at: 1,
  as_of_ms: 1,
  data: { items, has_more: next !== null, next_cursor: next, as_of_ms: 1 },
})

it.each([0, 20, 500])(
  'loads only the first page of 500 reports with %s unread',
  async (unread) => {
    const read = vi.fn(async () =>
      page(
        Array.from({ length: 50 }, (_, i) => header(String(i), i >= unread)),
        'older',
      ),
    )
    const inbox = await readReportInbox(read)
    expect(read.mock.calls).toEqual([[null]])
    expect(inbox.items).toHaveLength(50)
    expect(inbox.has_more).toBe(true)
    expect(inbox.next_cursor).toBe('older')
  },
)

it('refreshes only the explicitly loaded history', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(
      page(
        Array.from({ length: 100 }, (_, i) => header(String(i))),
        'older',
      ),
    )
    .mockResolvedValueOnce(page([header('oldest')]))
  expect((await readReportInbox(read, 101)).items).toHaveLength(101)
  expect(read).toHaveBeenCalledTimes(2)
})

it('restarts an archive traversal when recipient preferences change between pages', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([header('deleted')], 'older'))
    .mockResolvedValueOnce(page([header('older')], null, '2'))
    .mockResolvedValueOnce(page([header('survivor', true)], null, '2'))
  expect(await readReportInbox(read, 2)).toMatchObject({
    revision: '2',
    items: ['survivor'],
    has_more: false,
  })
  expect(read.mock.calls).toEqual([[null], ['older'], [null]])
})

it('extends shared membership and refreshes it if the continuation belongs to another revision', async () => {
  const initial = await readReportInbox(async () =>
    page(
      Array.from({ length: 100 }, (_, i) => header(String(i))),
      'older',
    ),
  )
  const sameRevision = await extendReportInbox(
    async () => page([header('last')]),
    initial,
  )
  expect(sameRevision.items).toHaveLength(101)
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([header('last')], null, '2'))
    .mockResolvedValueOnce(page([header('survivor')], null, '2'))
  expect((await extendReportInbox(read, initial)).items).toEqual(['survivor'])
  expect(read.mock.calls).toEqual([['older'], [null]])
})

it('finishes an empty inbox and rejects interrupted or invalid pagination', async () => {
  expect((await readReportInbox(async () => page([]))).items).toEqual([])
  await expect(readReportInbox(async () => null)).rejects.toThrow(
    'Unable to confirm',
  )
  const read = vi.fn().mockResolvedValue(page([], 'same'))
  await expect(readReportInbox(read, 1)).rejects.toThrow('pagination changed')
  expect(read).toHaveBeenCalledTimes(2)
  const initial = {
    revision: '1',
    items: [],
    has_more: true,
    next_cursor: 'same',
    as_of_ms: 1,
  }
  await expect(extendReportInbox(read, initial)).rejects.toThrow(
    'pagination changed',
  )
})

it('rejects an incomplete first page without a continuation cursor', async () => {
  const response = page([header('one')])
  response.data.has_more = true
  await expect(readReportInbox(async () => response)).rejects.toThrow(
    'pagination changed',
  )
})
