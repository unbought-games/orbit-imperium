import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildingUnavailableReason,
  visibleFacility,
} from './building-availability'
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

it('omits only Moon-exclusive facilities from planet catalogs', () => {
  expect(
    visibleFacility({ ...entry, body_kinds: ['Moon'] }, { kind: 'Planet' }),
  ).toBe(false)
  expect(
    visibleFacility({ ...entry, body_kinds: ['Moon'] }, { kind: 'Moon' }),
  ).toBe(true)
  expect(
    visibleFacility(
      { ...entry, body_kinds: ['Planet', 'Moon'] },
      { kind: 'Planet' },
    ),
  ).toBe(true)
  expect(
    visibleFacility({ ...entry, enabled: false }, { kind: 'Planet' }),
  ).toBe(true)
})

it('hides moon-only placeholders from the published catalog on planets', () => {
  const rules = JSON.parse(
    readFileSync(
      new URL('../../../../../rules/mvp-v1-slice-9.json', import.meta.url),
      'utf8',
    ),
  ) as { catalog: S['CatalogEntry3'][] }
  for (const id of ['LunarBase', 'SensorPhalanx', 'JumpGate']) {
    const placeholder = rules.catalog.find((item) => item.key.id === id)!
    expect(placeholder).toBeDefined()
    expect(placeholder.enabled).toBe(false)
    expect(visibleFacility(placeholder, { kind: 'Planet' })).toBe(false)
    expect(visibleFacility(placeholder, { kind: 'Moon' })).toBe(true)
  }
  const disabledPlanetFacility = rules.catalog.find(
    (item) => item.key.id === 'NaniteFactory',
  )!
  expect(visibleFacility(disabledPlanetFacility, { kind: 'Planet' })).toBe(true)
})

it('retains server-defined body support when a placeholder becomes enabled', () => {
  const enabled = {
    ...entry,
    key: { kind: 'Building', id: 'LunarBase' },
  } satisfies S['CatalogEntry3']
  expect(visibleFacility(enabled, { kind: 'Planet' })).toBe(true)
  expect(
    visibleFacility({ ...enabled, body_kinds: ['Moon'] }, { kind: 'Planet' }),
  ).toBe(false)
})
