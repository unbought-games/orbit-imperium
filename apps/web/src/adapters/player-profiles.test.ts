import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { playerProfilesApi } from './player-profiles'
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const binding = { account: id(1), player: id(2), universe: id(3), epoch: id(4) }
// Model an HTTP page: cryptographic random bytes exist, randomUUID does not.
beforeEach(() => {
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0xaa),
  })
})
afterEach(() => vi.unstubAllGlobals())
it('sends a bound view source and CSRF, never a subject or credential', async () => {
  const fetch = vi.fn().mockImplementation(async (_, options) => {
    const { context, source } = JSON.parse(options.body)
    expect(source).toEqual({ type: 'Galaxy', galaxy: 1, system: 2 })
    return Response.json({ ...context, players: [] })
  })
  vi.stubGlobal('fetch', fetch)
  await expect(
    playerProfilesApi(binding, 'csrf')(
      { type: 'Galaxy', galaxy: 1, system: 2 },
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ players: [] })
  expect(fetch.mock.calls[0][1].headers).toEqual({
    'content-type': 'application/json',
    'x-csrf-token': 'csrf',
    'x-orbit-insignia': '1',
  })
})
it('rejects wrong bindings, request correlation, private fields and unknown tiers', async () => {
  for (const transform of [
    (r: Record<string, unknown>) => ({
      ...r,
      binding: { ...binding, universe: id(9) },
    }),
    (r: Record<string, unknown>) => ({ ...r, request_id: id(9) }),
    (r: Record<string, unknown>) => ({ ...r, subject: 'private' }),
    (r: Record<string, unknown>) => ({
      ...r,
      players: [
        {
          player: id(2),
          username: 'Player',
          expires_at: 300,
          observed_at: 100,
          supporter_tier: 4,
        },
      ],
    }),
  ]) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async (_, options) =>
          Response.json(
            transform({ ...JSON.parse(options.body).context, players: [] }),
          ),
        ),
    )
    await expect(
      playerProfilesApi(binding, 'csrf')(
        { type: 'SelfAccount' },
        new AbortController().signal,
      ),
    ).rejects.toThrow()
  }
})
