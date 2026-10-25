import { describe, expect, it } from 'vitest'
import type { components } from '../contracts'
import {
  dispatchSendLabel,
  missionReturn,
  reviewDestination,
} from './dispatch-review-model'
type S = components['schemas']
const at = { galaxy: 1, system: 24, position: 6 }
const target = {
  id: 'body',
  owner: 'player',
  kind: 'Planet' as const,
  name: 'Ember Watch',
}
const body: S['MissionDestination4'] = {
  type: 'Body',
  id: target.id,
  expected_owner: target.owner,
  expected_kind: target.kind,
}
const intent: S['FleetIntent4'] = {
  origin: 'origin',
  destination: body,
  mission: 'Attack',
  ships: [{ owner: 'player', ship_type: 'LightFighter', count: '13' }],
  cargo: { metal: '0', crystal: '0', deuterium: '0' },
  speed_percent: 100,
}
describe('dispatch review identity', () => {
  it('names only the same body, kind and owner as the authoritative quote', () => {
    expect(reviewDestination(body, at, target)).toMatchObject({
      name: 'Ember Watch',
      owner: 'player',
      kind: 'planet',
      coordinates: at,
    })
    for (const changed of [
      { id: 'replacement' },
      { owner: 'new owner' },
      { kind: 'Moon' as const },
    ])
      expect(reviewDestination(body, at, { ...target, ...changed }).name).toBe(
        'Unknown planet',
      )
    expect(reviewDestination(body, at).name).toBe('Unknown planet')
    expect(
      reviewDestination(body, at, { ...target, name: undefined }).name,
    ).toBe('Unnamed planet')
    expect(
      reviewDestination({ ...body, expected_kind: 'Moon' }, at, target),
    ).toMatchObject({ name: 'Unknown moon', kind: 'moon' })
  })
  it('keeps empty positions and debris unowned, using quoted coordinates', () => {
    for (const destination of [
      { type: 'Debris', field_identity: 'field', coordinates: at },
      { type: 'EmptyPosition', slot_revision: '1', coordinates: at },
    ] as const) {
      expect(
        reviewDestination(destination, { ...at, position: 2 }, target),
      ).toEqual({
        name: destination.type === 'Debris' ? 'Debris field' : 'Empty position',
        coordinates: at,
        kind: destination.type === 'Debris' ? 'debris' : 'planet',
        owner: undefined,
      })
    }
  })
})
describe('mission-specific review wording', () => {
  it.each([
    ['Attack', 'Attack with 13 Light Fighter'],
    ['Espionage', 'Spy with 13 Light Fighter'],
    ['Harvest', 'Harvest with 13 Light Fighter'],
    ['Colonize', 'Colonize with 13 Light Fighter'],
    ['Transport', 'Transport to Ember Watch [1:24:6]'],
    ['Deploy', 'Deploy to Ember Watch [1:24:6]'],
  ] as const)('%s names the action and object', (mission, expected) => {
    expect(
      dispatchSendLabel(
        { ...intent, mission },
        reviewDestination(body, at, target),
      ),
    ).toBe(expected)
  })
  it('summarizes mixed fleets without losing large counts', () => {
    expect(
      dispatchSendLabel(
        {
          ...intent,
          ships: [
            ...intent.ships,
            {
              owner: 'player',
              ship_type: 'SmallCargo',
              count: '9007199254740993',
            },
          ],
        },
        reviewDestination(body, at),
      ),
    ).toBe('Attack with 9007199254741006 ships')
  })
  it('does not promise a return from deployment, colonization or combat', () => {
    expect(missionReturn.Deploy.label).toBe('No scheduled return')
    expect(missionReturn.Colonize.label).toBe('Return if needed')
    expect(missionReturn.Attack.label).toBe('Return if surviving')
    expect(missionReturn.Espionage.label).toBe('Return if surviving')
  })
})
