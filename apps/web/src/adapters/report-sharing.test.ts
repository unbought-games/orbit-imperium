import { afterEach, expect, it, vi } from 'vitest'
import { reportSharing } from './report-sharing'

afterEach(() => vi.unstubAllGlobals())

it('sends bound report actions and CSRF on HTTP without randomUUID', async () => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0xaa),
  })
  const fetch = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ token: null, options: null }),
    )
  vi.stubGlobal('fetch', fetch)
  const id = '00000000-0000-4000-8000-000000000001'
  const binding = { account: id, player: id, universe: id, epoch: id }
  await expect(
    reportSharing(binding, 'csrf', id, { type: 'Status' }),
  ).resolves.toEqual({ token: null, options: null })
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    context: { binding, request_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },
    action: { type: 'Status' },
  })
  expect(fetch.mock.calls[0][1].headers['X-CSRF-Token']).toBe('csrf')
})
