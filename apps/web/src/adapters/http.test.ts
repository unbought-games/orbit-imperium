import { it, expect, vi, afterEach } from 'vitest'
import { gamePort, request } from './http'
import { readyFixture } from '../test-support/bootstrap'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
it('uses the bootstrapped protocol on the first subsequent request', async () => {
  for (const protocol of [2, 3, 4] as const) {
    const { session, snapshot } = readyFixture(protocol)
    const fetch = vi.fn(
      async () => new Response(JSON.stringify(snapshot.view), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)
    await gamePort(session.csrf, snapshot.candidate).view({
      binding: snapshot.candidate.binding,
      request_id: snapshot.request_id,
    })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]).toEqual([
      `/api/v${protocol}/universes/${snapshot.candidate.binding.universe}/overview`,
      expect.objectContaining({
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'csrf',
          'X-Orbit-View-Metadata': '1',
        },
      }),
    ])
  }
})

it.each(['loginBootstrap', 'signupBootstrap'] as const)(
  '%s receives committed authentication after slow credentials and game preparation',
  async (method) => {
    const { http } = await import('./http')
    const { bootstrapFixture } = await import('../test-support/bootstrap')
    const payload = bootstrapFixture()
    if (payload.result.status === 'authenticated')
      payload.result.game = { status: 'unavailable', code: 'Unavailable' }
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new Error('request timeout')), ms)
      return controller.signal
    })
    vi.stubGlobal(
      'fetch',
      (_path: string, options: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          options.signal!.addEventListener('abort', () =>
            reject(options.signal!.reason),
          )
          // Credentials commit after seven seconds, then the game read uses its five-second budget.
          setTimeout(
            () =>
              resolve(new Response(JSON.stringify(payload), { status: 200 })),
            12000,
          )
        }),
    )
    const result = http[method]('new-player', 'password').then(
      (value) => value,
      (error) => ({ error: String(error) }),
    )
    await vi.advanceTimersByTimeAsync(12000)
    expect(await result).toEqual(payload)
    vi.useRealTimers()
    vi.restoreAllMocks()
  },
)

it('requests snapshot metadata and a minimum revision while accepting an older response shape', async () => {
  const { session, snapshot } = readyFixture(4)
  const fetch = vi.fn(
    async () => new Response(JSON.stringify(snapshot.view), { status: 200 }),
  )
  vi.stubGlobal('fetch', fetch)
  await gamePort(session.csrf, snapshot.candidate).view(
    { binding: snapshot.candidate.binding, request_id: snapshot.request_id },
    '12',
  )
  expect(fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      headers: expect.objectContaining({
        'X-Orbit-View-Metadata': '1',
        'X-Orbit-Minimum-Revision': '12',
      }),
    }),
  )
})

it.each(['bootstrap', 'loginBootstrap', 'signupBootstrap'] as const)(
  '%s opts into bootstrap progress while preserving old-server compatibility',
  async (method) => {
    const { http } = await import('./http')
    const { bootstrapFixture } = await import('../test-support/bootstrap')
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(bootstrapFixture(4)), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)
    await http[method]('player', 'password')
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Orbit-View-Metadata': '1' }),
      }),
    )
  },
)

it.each([
  ['60', 60000],
  ['Thu, 29 Oct 2026 14:01:00 GMT', 60000],
  ['Thu, 29 Oct 2026 13:59:00 GMT', 0],
  ['invalid', 0],
  [null, 0],
])('preserves HTTP 429 and parses Retry-After %s', async (header, expected) => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-29T14:00:00Z'))
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ code: 'RateLimited' }), {
          status: 429,
          headers: header ? { 'Retry-After': header } : {},
        }),
    ),
  )
  await expect(request('/commands', 'POST')).rejects.toMatchObject({
    status: 429,
    code: 'RateLimited',
    retryAfterMs: expected,
  })
})
