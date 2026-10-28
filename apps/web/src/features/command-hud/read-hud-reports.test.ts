import { expect, it, vi } from 'vitest'
import { readHudReports } from './read-hud-reports'
const header = (id: string, read = false) => ({
  id,
  kind: 'Espionage',
  read,
  hidden: false,
  observed_at: 1,
})
it('passes read-only pages to find older unread reports, stopping at 99 unique unread', async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      items: [header('old', true)],
      has_more: true,
      next_cursor: 'next',
    })
    .mockResolvedValueOnce({
      items: [header('one'), header('one')],
      has_more: true,
      next_cursor: 'older',
    })
    .mockResolvedValueOnce({
      items: Array.from({ length: 98 }, (_, i) => header(String(i))),
      has_more: true,
      next_cursor: 'unused',
    })
  await readHudReports(read)
  expect(read.mock.calls).toEqual([[null], ['next'], ['older']])
})
it('finishes a small inbox and rejects invalid or interrupted pagination', async () => {
  await expect(
    readHudReports(async () => ({
      items: [],
      has_more: false,
      next_cursor: null,
      as_of_ms: 0,
    })),
  ).resolves.toBeUndefined()
  await expect(readHudReports(async () => null)).rejects.toThrow(
    'Unable to confirm',
  )
  const read = vi
    .fn()
    .mockResolvedValue({ items: [], has_more: true, next_cursor: 'same' })
  await expect(readHudReports(read)).rejects.toThrow('pagination changed')
  expect(read).toHaveBeenCalledTimes(2)
})
