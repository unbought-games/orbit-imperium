import { expect, it } from 'vitest'
import { matchPublicRoute } from './public-route-patterns'
import routes from './analytics-routes.json'
it('keeps public dispatch constraints and exposes its canonical analytics patterns', () => {
  expect(
    matchPublicRoute(
      'profile',
      '/profiles/00000000-0000-4000-8000-000000000001/',
    )?.[1],
  ).toBe('00000000-0000-4000-8000-000000000001')
  expect(matchPublicRoute('profile', '/profiles/not-a-profile')).toBeNull()
  expect(
    matchPublicRoute('alliance', '/alliances/world/alliance')?.slice(1),
  ).toEqual(['world', 'alliance'])
  expect(matchPublicRoute('directoryRoot', '/ALLIANCES/')?.[0]).toBe(
    '/ALLIANCES/',
  )
  expect(routes).toContain('/invite/:code')
  expect(routes).toContain('/invite/:universe/:token')
  expect(routes).toContain('/alliances/:universe/:alliance')
  expect(routes).toContain('/u/:universe/b/:body/resources/:item')
})
