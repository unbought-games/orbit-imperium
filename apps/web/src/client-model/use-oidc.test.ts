import { deferred } from '../features/progression/progression-test-fixture'
import { expect, it, vi } from 'vitest'
import { oidcLoginPath, requestOidcConfig, type OidcConfig } from './use-oidc'

it('rejects external redirects and browser-normalized control characters', () => {
  for (const path of [
    'https://evil.example',
    '//evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/\u0000/evil.example',
    '/\u007f/evil.example',
    '/\\evil.example',
  ])
    expect(oidcLoginPath(path)).toBe('/api/auth/login?return_to=%2F')
})

it('preserves local game destinations and verification intent', () => {
  expect(oidcLoginPath('/game?tab=fleet', true)).toBe(
    '/api/auth/login?return_to=%2Fgame%3Ftab%3Dfleet&verify=true',
  )
})

it.each(['local', 'oidc'] as const)(
  'publishes the current %s config after retry and ignores obsolete completions',
  async (mode) => {
    const obsoleteSuccess = deferred<OidcConfig>()
    const obsoleteFailure = deferred<OidcConfig>()
    const failed = deferred<OidcConfig>()
    const retried = deferred<OidcConfig>()
    const publish = vi.fn()
    const stopSuccess = requestOidcConfig(
      publish,
      () => obsoleteSuccess.promise,
    )
    stopSuccess()
    const stopFailure = requestOidcConfig(
      publish,
      () => obsoleteFailure.promise,
    )
    stopFailure()
    const stop = requestOidcConfig(publish, () => failed.promise)
    failed.reject(new Error('unavailable'))
    await failed.promise.catch(() => {})
    expect(publish.mock.calls).toEqual([[{ status: 'error' }]])
    stop()
    const finish = requestOidcConfig(publish, () => retried.promise)
    const config = { mode, universes: [] }
    retried.resolve(config)
    await retried.promise
    obsoleteSuccess.resolve({
      mode: mode === 'local' ? 'oidc' : 'local',
      universes: [],
    })
    obsoleteFailure.reject(new Error('old request'))
    await Promise.allSettled([obsoleteSuccess.promise, obsoleteFailure.promise])
    expect(publish.mock.calls).toEqual([
      [{ status: 'error' }],
      [{ status: 'ready', config }],
    ])
    finish()
  },
)
