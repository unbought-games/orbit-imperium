import { afterEach, expect, it, vi } from 'vitest'
import { reportSharing } from './report-sharing'

afterEach(() => vi.unstubAllGlobals())

it('sends bound report actions and CSRF on HTTP without randomUUID', async () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0xaa),
  })
  const id = '00000000-0000-4000-8000-000000000001'
  const status = {
    token: null,
    options: null,
    viewer_revision: '1',
    header: {
      id,
      kind: 'Combat',
      observed_at: 1000,
      read: true,
      hidden: false,
      starred: false,
      shared: false,
    },
  }
  const fetch = vi.fn().mockImplementation(async () => Response.json(status))
  vi.stubGlobal('fetch', fetch)
  const binding = { account: id, player: id, universe: id, epoch: id }
  await expect(
    reportSharing(binding, 'csrf', id, { type: 'Status' }),
  ).resolves.toEqual(status)
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    context: { binding, request_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
    action: { type: 'Status' },
  })
  expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('csrf')
})
