import { describe, it, expect } from 'vitest'
import {
  locationPath,
  parseLocationLink,
  readAddress,
  validateLocationIntent,
} from './location-address'
import { draftFromSearch } from './dispatch-location'
const at = { galaxy: 1, system: 234, position: 8 }
describe('location addresses', () => {
  it('shares locations independently of any player departure body', () => {
    expect(locationPath('Andromeda Prime', at)).toBe(
      '/u/andromeda-prime/location/1:234:8',
    )
    expect(
      locationPath('Andromeda Prime', at, {
        target: 'moon',
        mission: 'Attack',
      }),
    ).toBe('/u/andromeda-prime/location/1:234:8?target=moon&mission=attack')
  })
  it('rejects malformed coordinates and unsupported intent', () => {
    for (const value of [
      '1:2',
      '0:2:3',
      '-1:2:3',
      '1:2:3:4',
      '1:2:9007199254740993',
    ])
      expect(readAddress(value)).toBeNull()
    expect(() =>
      validateLocationIntent({ target: 'moon', mission: 'colonize' }),
    ).toThrow()
    expect(() => validateLocationIntent({ mission: 'launch' })).toThrow()
  })
  it('preserves kind while rejecting foreign servers and universes', () => {
    const url =
      'https://game.test/u/andromeda-prime/location/1:234:8?target=moon'
    expect(
      parseLocationLink(url, 'https://game.test', 'Andromeda Prime'),
    ).toEqual({ coordinates: at, target: 'moon' })
    expect(
      parseLocationLink(url, 'https://other.test', 'Andromeda Prime'),
    ).toBeNull()
    expect(parseLocationLink(url, 'https://game.test', 'Other')).toBeNull()
    expect(
      parseLocationLink('/u/%xx/location/1:2:3', 'https://game.test', 'Other'),
    ).toBeNull()
  })
  it('reconstructs a dispatch draft from a refresh without silently selecting a planet for a moon', () => {
    expect(
      draftFromSearch({ ...at, target: 'moon', mission: 'Attack' }),
    ).toEqual({ coordinates: at, targetKind: 'moon', mission: 'Attack' })
    expect(draftFromSearch({})).toBeNull()
  })
})
