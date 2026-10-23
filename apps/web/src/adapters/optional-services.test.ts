import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('./analytics')
  vi.resetModules()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('contains blocked scripts and module evaluation failures', async () => {
  const load = vi.fn(() => {
    throw new Error('Blocked by content blocker')
  })
  vi.doMock('./analytics', load)
  const optional = await import('./optional-services')
  expect(load).not.toHaveBeenCalled()
  await expect(optional.startAnalytics()).resolves.toBeUndefined()
  await expect(optional.startAnalytics()).resolves.toBeUndefined()
  expect(load).toHaveBeenCalledTimes(1)
  expect(() => optional.bindAnalytics()).not.toThrow()
  expect(() => optional.resetAnalytics()).not.toThrow()
})

it.each(['throw', 'reject'] as const)(
  'contains SDK startup failures (%s)',
  async (failure) => {
    vi.doMock('./analytics', () => ({
      startAnalytics: () => {
        if (failure === 'throw') throw new Error('SDK unavailable')
        return Promise.reject(new Error('SDK unavailable'))
      },
    }))
    const optional = await import('./optional-services')
    await expect(optional.startAnalytics()).resolves.toBeUndefined()
  },
)

it.each(['throw', 'reject', 'pending'] as const)(
  'enrollment and logout succeed when analytics calls %s',
  async (failure) => {
    vi.useFakeTimers()
    const bind = vi.fn(() => {
      if (failure === 'throw') throw new Error('Blocked')
      if (failure === 'reject') return Promise.reject(new Error('Blocked'))
      return new Promise<void>(() => {})
    })
    const reset = vi.fn(() => {
      throw new Error('SDK storage unavailable')
    })
    vi.doMock('./analytics', () => ({
      startAnalytics: vi.fn().mockResolvedValue(undefined),
      bindAnalytics: bind,
      resetAnalytics: reset,
    }))
    const optional = await import('./optional-services')
    await optional.startAnalytics()
    const { oidcHttp } = await import('./oidc')
    const { http } = await import('./http')
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrf: 'csrf' }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    // No clock advancement: enrollment cannot wait on analytics or a timeout.
    await expect(oidcHttp.enroll('universe')).resolves.toBeUndefined()
    await expect(http.logout('csrf')).resolves.toBeUndefined()
    expect(bind).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/v1/session',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(vi.getTimerCount()).toBe(0)
  },
)
