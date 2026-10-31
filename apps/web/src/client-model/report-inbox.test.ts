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

it('passes read-only pages and counts unique unread reports up to the badge cap', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce(page([header('read', true)], 'next'))
    .mockResolvedValueOnce(page([header('one'), header('one')], 'older'))
    .mockResolvedValueOnce(
      page(
        Array.from({ length: 98 }, (_, i) => header(String(i))),
        'unused',
      ),
    )
  const inbox = await readReportInbox(read)
  expect(read.mock.calls).toEqual([[null], ['next'], ['older']])
  expect(inbox.items).toHaveLength(100)
  expect(inbox.next_cursor).toBe('unused')
})

it('refreshes beyond the badge cap to preserve previously loaded history', async () => {
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
  expect(await readReportInbox(read)).toMatchObject({
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
  await expect(readReportInbox(read)).rejects.toThrow('pagination changed')
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
