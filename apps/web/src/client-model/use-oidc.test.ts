import { expect, it } from 'vitest'
import { oidcLoginPath } from './use-oidc'

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
