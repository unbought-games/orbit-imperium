import { expect, it } from 'vitest'
import { hostedEnrollmentTarget, hostedJoinUniverse } from './use-hosted-join'

it('recognizes only an explicit universe return route', () => {
  const universe = '00000000-0000-4000-8000-000000000003'
  expect(hostedJoinUniverse(`/join/${universe}`)).toBe(universe)
  for (const path of [
    '/',
    '/login',
    '/join/anything',
    `/join/${universe}/extra`,
    `//join/${universe}`,
  ])
    expect(hostedJoinUniverse(path)).toBeUndefined()
})

const hosted = '00000000-0000-4000-8000-000000000003'
const foreign = '00000000-0000-4000-8000-000000000099'
it.each([
  ['local', null, hosted, undefined],
  ['local', hosted, hosted, undefined],
  ['oidc', null, hosted, undefined],
  ['oidc', foreign, hosted, undefined],
  ['oidc', hosted, hosted, hosted],
  ['oidc', hosted, undefined, hosted],
  ['oidc', null, undefined, undefined],
] as const)(
  'derives the hosted enrollment target for %s config %s and route %s',
  (mode, configured, requested, expected) => {
    expect(
      hostedEnrollmentTarget(
        { mode, hosted_universe: configured, universes: [] },
        requested,
      ),
    ).toBe(expected)
  },
)
