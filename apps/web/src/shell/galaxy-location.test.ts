import { expect, it } from 'vitest'
import {
  galaxyTarget,
  galaxyOwnsScroll,
  readCoordinates,
  validateGalaxySearch,
} from './galaxy-location'

it('links a viewed location without selecting its body or changing universe', () => {
  expect(
    galaxyTarget('Andromeda Prime', 'active-owned-world', {
      galaxy: 2,
      system: 5,
      position: 12,
    }),
  ).toEqual({
    to: '/u/$universe/b/$body/galaxy',
    params: { universe: 'andromeda-prime', body: 'active-owned-world' },
    search: { galaxy: 2, system: 5, position: 12 },
  })
})

it('accepts recorded coordinates independently of a current entity', () => {
  expect(readCoordinates({ galaxy: 1, system: 5, position: 12 })).toEqual({
    galaxy: 1,
    system: 5,
    position: 12,
  })
  for (const value of [
    null,
    undefined,
    {},
    { galaxy: 1, system: 5 },
    { galaxy: 0, system: 5, position: 12 },
    { galaxy: 1, system: 1.5, position: 12 },
    { galaxy: 1, system: Infinity, position: 12 },
    { galaxy: '1', system: 5, position: 12 },
  ]) {
    expect(readCoordinates(value)).toBeNull()
  }
})

it('validates optional galaxy search and rejects malformed or unsafe URL values', () => {
  expect(validateGalaxySearch({ body: 'origin' })).toEqual({})
  expect(
    validateGalaxySearch({
      galaxy: 1,
      system: 5,
      position: 12,
      body: 'origin',
    }),
  ).toEqual({ galaxy: 1, system: 5, position: 12 })
  expect(validateGalaxySearch({ system: 5 })).toEqual({ system: 5 })
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    'bad',
    null,
    [],
  ]) {
    expect(() => validateGalaxySearch({ galaxy: value })).toThrow(
      'invalid galaxy coordinates',
    )
  }
})

it('leaves ordinary page scroll restoration alone but lets a galaxy position reveal itself', () => {
  expect(galaxyOwnsScroll('/u/andromeda/b/home/galaxy', { position: 12 })).toBe(
    true,
  )
  expect(galaxyOwnsScroll('/u/andromeda/galaxy', { position: 12 })).toBe(true)
  expect(galaxyOwnsScroll('/u/andromeda/b/home/galaxy', {})).toBe(false)
  expect(galaxyOwnsScroll('/u/andromeda/b/home/fleets', { position: 12 })).toBe(
    false,
  )
  expect(galaxyOwnsScroll('/u/andromeda/b/home/galaxy', { position: -1 })).toBe(
    false,
  )
})
