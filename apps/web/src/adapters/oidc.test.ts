import { afterEach, expect, it, vi } from 'vitest'
import { oidcHttp } from './oidc'

afterEach(() => vi.unstubAllGlobals())

it('passes config cancellation through and preserves local or OIDC configuration', async () => {
  const signal = new AbortController().signal
  for (const config of [
    { mode: 'local', universes: [] },
    {
      mode: 'oidc',
      universes: [{ universe: 'universe', name: 'Andromeda' }],
      accounts_url: 'https://accounts.example',
      client_id: 'game',
    },
  ]) {
    const fetch = vi.fn().mockResolvedValue(Response.json(config))
    vi.stubGlobal('fetch', fetch)
    expect(await oidcHttp.config(signal)).toEqual(config)
    expect(fetch).toHaveBeenCalledWith('/api/auth/config', { signal })
  }
})

it('unavailable config reports failure while anonymous identity returns no account data', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 })),
  )
  await expect(oidcHttp.config(new AbortController().signal)).rejects.toThrow(
    'Unable to load sign-in options.',
  )
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('anonymous', { status: 401 })),
  )
  expect(await oidcHttp.identity()).toBeNull()
})

it('returns the verified identity claims without inventing game state', async () => {
  const identity = {
    username: 'player',
    email_verified: false,
    supporter_tier: 2,
    expires_at: 300,
  }
  const fetch = vi.fn().mockResolvedValue(Response.json(identity))
  vi.stubGlobal('fetch', fetch)
  expect(await oidcHttp.identity()).toEqual(identity)
  expect(fetch).toHaveBeenCalledWith('/api/auth/identity', {
    signal: undefined,
    cache: 'no-store',
  })
})

it('distinguishes a temporary identity failure from a signed-out account', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  )
  await expect(oidcHttp.identity()).rejects.toThrow(
    'Unable to refresh account identity.',
  )
})

it('enrollment obtains the current session CSRF token before submitting the selected universe', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ csrf: 'session-csrf' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  await oidcHttp.enroll('selected-universe')
  expect(fetch.mock.calls).toEqual([
    ['/api/v1/session'],
    [
      '/api/auth/enroll',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'session-csrf',
        },
        body: JSON.stringify({ universe: 'selected-universe' }),
      },
    ],
  ])
})

it('rejected enrollment retains the existing actionable error', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ csrf: 'session-csrf' }))
      .mockResolvedValueOnce(new Response(null, { status: 409 })),
  )
  await expect(oidcHttp.enroll('full-universe')).rejects.toThrow(
    'This universe is closed, full, or temporarily unavailable. Your account is ready; choose another universe or try later.',
  )
})
