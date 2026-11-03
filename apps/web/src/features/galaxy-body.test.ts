import { expect, it } from 'vitest'
import type { components } from '../contracts'
import { observedBody } from './galaxy-body'
import { observedMissionWarning } from '../client-model/dispatch-validation'
type S = components['schemas']
const observation: S['GalaxySystem4'] = {
  galaxy: 1,
  system: 1,
  observed_at: 1000,
  positions: [
    {
      coordinates: { galaxy: 1, system: 1, position: 3 },
      body: {
        id: 'planet',
        kind: 'Planet',
        owner: 'other',
        activity: { type: 'None' },
        inactivity: 'Active',
        vacation: false,
        espionage_eligible: false,
        attack_blocker: 'BeginnerProtected',
      },
      moon: { id: 'moon', diameter_km: 8366, activity: { type: 'Recent' } },
      debris: null,
    },
  ],
}
it('uses the observed lunar identity and its current owner policy for both hostile missions', () => {
  const moon = observedBody(observation, 'moon')
  expect(moon).toMatchObject({
    id: 'moon',
    kind: 'Moon',
    owner: 'other',
    activity: { type: 'Recent' },
    attack_blocker: 'BeginnerProtected',
    espionage_eligible: false,
  })
  for (const mission of ['Attack', 'Espionage'] as const) {
    expect(observedMissionWarning(mission, moon)).toContain(
      'Beginner protection',
    )
  }
  expect(observedBody(observation, 'planet')).toEqual(
    observation.positions[0].body,
  )
})
it('does not substitute a parent or replacement for an unobserved identity', () => {
  for (const id of [undefined, 'old-moon', 'unknown'])
    expect(observedBody(observation, id)).toBeUndefined()
  expect(observedBody(undefined, 'moon')).toBeUndefined()
  const removed = {
    ...observation,
    positions: [{ ...observation.positions[0], moon: undefined }],
  }
  expect(observedBody(removed, 'moon')).toBeUndefined()
})
