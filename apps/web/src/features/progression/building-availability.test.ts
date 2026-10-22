import { describe, expect, it } from 'vitest'
import { buildingUnavailableReason } from './building-availability'
import type { components } from '../../contracts'

type S = components['schemas']
const entry: S['CatalogEntry3'] = {
  key: { kind: 'Building', id: 'Shipyard' },
  enabled: true,
  body_kinds: ['Planet'],
  mobile: false,
  requirements: [
    { type: 'BodyBuilding', building: 'RoboticsFactory', level: 2 },
  ],
}
const body = {
  kind: 'Planet',
  levels: { Shipyard: 0, RoboticsFactory: 0 },
} satisfies Pick<S['BodyV3'], 'kind' | 'levels'>

describe('building inspection availability', () => {
  it('leaves prerequisite and construction eligibility to the server quote', () => {
    expect(buildingUnavailableReason(entry, body)).toBeUndefined()
  })
  it('explains universe, body and unavailable level restrictions', () => {
    expect(buildingUnavailableReason({ ...entry, enabled: false }, body)).toBe(
      'Unavailable in this universe.',
    )
    expect(buildingUnavailableReason(entry, { ...body, kind: 'Moon' })).toBe(
      'Unavailable on this moon.',
    )
    expect(buildingUnavailableReason(entry, { ...body, levels: {} })).toBe(
      'Building level unavailable on this body.',
    )
  })
  it('preserves inspection of known resource levels when catalog data is absent', () => {
    expect(
      buildingUnavailableReason(undefined, body, 'Shipyard'),
    ).toBeUndefined()
    expect(buildingUnavailableReason(undefined, body, 'FusionReactor')).toBe(
      'Building level unavailable on this body.',
    )
  })
})
