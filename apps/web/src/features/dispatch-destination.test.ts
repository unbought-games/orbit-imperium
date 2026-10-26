import { describe, expect, it } from 'vitest'
import { readyFixture } from '../test-support/bootstrap'
import type { components } from '../contracts'
import {
  destinationBody,
  ownedDestinationPlanets,
} from './dispatch-destination'
type S = components['schemas']
const coordinates = { galaxy: 1, system: 2, position: 3 }
const view = readyFixture(4).snapshot.view as S['BoundView4']
const planet = {
  id: 'colony',
  kind: 'Planet',
  name: 'New name',
  coordinates,
} as S['BodyV3']
const moon = { ...planet, id: 'moon', kind: 'Moon' } as S['BodyV3']
const observation = {
  galaxy: 1,
  system: 2,
  positions: [
    {
      coordinates,
      body: {
        id: 'colony',
        kind: 'Planet',
        name: 'Old name',
        owner: view.binding.player,
      },
    },
  ],
} as S['GalaxySystem4']

describe('dispatch destination identity', () => {
  it('derives choices from live planets and excludes the current origin and moons', () => {
    expect(ownedDestinationPlanets([planet, moon], planet.id)).toEqual([])
    expect(ownedDestinationPlanets([planet, moon], moon.id)).toEqual([planet])
  })
  it('uses current empire names before advisory observations', () => {
    expect(
      destinationBody(
        { ...view, bodies: [planet] },
        coordinates,
        'planet',
        observation,
      )?.name,
    ).toBe('New name')
    expect(
      destinationBody(
        { ...view, bodies: [{ ...planet, name: 'Renamed' }] },
        coordinates,
        'planet',
        observation,
      )?.name,
    ).toBe('Renamed')
  })
  it('distinguishes live ownership from a retained observation after a colony leaves the empire', () => {
    expect(
      destinationBody(
        { ...view, bodies: [planet] },
        coordinates,
        'planet',
        observation,
      )?.source,
    ).toBe('empire')
    expect(
      destinationBody(view, coordinates, 'planet', observation)?.source,
    ).toBe('observation')
  })
  it('never uses a planet identity for a moon, debris, partial input or a different system', () => {
    const owned = { ...view, bodies: [planet, moon] }
    expect(destinationBody(owned, coordinates, 'moon', observation)?.id).toBe(
      'moon',
    )
    expect(
      destinationBody(owned, coordinates, 'debris', observation),
    ).toBeUndefined()
    expect(destinationBody(owned, null, 'planet', observation)).toBeUndefined()
    expect(
      destinationBody(
        owned,
        { ...coordinates, system: 3 },
        'planet',
        observation,
      ),
    ).toBeUndefined()
    expect(
      destinationBody(view, coordinates, 'moon', observation),
    ).toBeUndefined()
  })
  it('uses only matching public observations for other players', () => {
    const publicSystem = {
      ...observation,
      positions: [
        {
          coordinates,
          body: { ...observation.positions[0].body!, owner: 'other' },
          debris: null,
        },
      ],
    }
    expect(
      destinationBody(view, coordinates, 'planet', publicSystem)?.name,
    ).toBe('Old name')
    expect(
      destinationBody(
        view,
        { ...coordinates, position: 4 },
        'planet',
        publicSystem,
      ),
    ).toBeUndefined()
  })
})
