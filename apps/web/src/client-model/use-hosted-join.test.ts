import { expect, it } from 'vitest'
import { hostedJoinUniverse } from './use-hosted-join'

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
