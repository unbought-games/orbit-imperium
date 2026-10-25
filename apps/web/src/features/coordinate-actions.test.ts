import { expect, it } from 'vitest'
import { coordinateMissions } from './coordinate-actions'
import type { BoundView } from '../client-model/commands'
const at = { galaxy: 1, system: 2, position: 3 }
const view = {
  protocol: 4,
  binding: { player: 'me' },
  bodies: [{ id: 'home', kind: 'Planet', coordinates: at }],
  capabilities: [
    'Transport',
    'Deploy',
    'Colonize',
    'Attack',
    'Espionage',
    'Harvest',
  ].map((capability) => ({ capability, enabled: true })),
} as unknown as BoundView
it('derives missions from ownership, occupancy, target kind and enabled capabilities', () => {
  expect(coordinateMissions(view, at, 'planet')).toEqual([
    'Transport',
    'Deploy',
  ])
  expect(
    coordinateMissions(view, { ...at, position: 4 }, 'planet', { empty: true }),
  ).toEqual(['Colonize'])
  expect(coordinateMissions(view, at, 'debris')).toEqual(['Harvest'])
  expect(coordinateMissions(view, at, 'moon', { owner: 'other' })).toEqual([
    'Attack',
    'Espionage',
    'Transport',
  ])
  expect(
    coordinateMissions({ ...view, capabilities: [] }, at, 'planet'),
  ).toEqual([])
})
