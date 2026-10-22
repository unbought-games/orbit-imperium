import { expect, it } from 'vitest'
import {
  coordinateErrors,
  destinationError,
  dispatchFailure,
} from './dispatch-validation'
const settings = {
  galaxies: 2,
  systems_per_galaxy: 499,
  positions_per_system: 15 as const,
}
const valid = { galaxy: '2', system: '499', position: '15' }
it('accepts the universe boundaries and rejects values beyond each dimension', () => {
  expect(coordinateErrors(valid, settings)).toEqual({
    galaxy: '',
    system: '',
    position: '',
  })
  for (const field of ['galaxy', 'system', 'position'] as const) {
    expect(
      coordinateErrors(
        { ...valid, [field]: String(Number(valid[field]) + 1) },
        settings,
      )[field],
    ).toContain('from 1 to')
  }
})
it.each([
  '🏎️',
  '1🏎️',
  '',
  '0',
  '-1',
  '1.5',
  '1e1',
  ' 1',
  '1\n',
  '01',
  '1:2:3',
  '9007199254740993',
])('rejects pasted or invalid coordinate %j before review', (value) => {
  expect(
    coordinateErrors({ ...valid, position: value }, settings).position,
  ).toContain('Enter a whole position number from 1 to 15.')
})
const own = {
  type: 'Body' as const,
  id: 'colony',
  expected_owner: 'me',
  expected_kind: 'Planet' as const,
}
it('blocks hostile own targets while preserving transport to another owned planet and harvesting', () => {
  expect(destinationError('Attack', own, 'me', 'home')).toContain(
    'use Transport',
  )
  expect(destinationError('Espionage', own, 'me', 'home')).toContain(
    'cannot spy',
  )
  expect(destinationError('Transport', own, 'me', 'home')).toBe('')
  expect(destinationError('Transport', own, 'me', 'colony')).toContain(
    'departure planet',
  )
  expect(
    destinationError(
      'Harvest',
      {
        type: 'Debris',
        field_identity: 'field',
        coordinates: { galaxy: 1, system: 1, position: 1 },
      },
      'me',
      'home',
    ),
  ).toBe('')
})
it.each([
  'BeginnerProtected',
  'QuoteChanged',
  'TargetVacation',
  'InvalidInput',
  'NotFound',
  'PositionOccupied',
  'NoFleetSlot',
  'InsufficientShips',
])('translates %s for quote and launch failures', (code) => {
  expect(dispatchFailure(new Error(code))).toBe(dispatchFailure(code))
  expect(dispatchFailure(code)).not.toContain(code)
  expect(dispatchFailure(code)).not.toContain('Unable to validate')
})
it('does not expose unknown server errors', () => {
  expect(dispatchFailure(new Error('InternalDatabaseDetails'))).toBe(
    'Unable to validate this mission. Check your connection and review again.',
  )
})

it('accepts empty-position colony targets without treating them as body identities', () => {
  expect(
    destinationError(
      'Colonize',
      {
        type: 'EmptyPosition',
        coordinates: { galaxy: 1, system: 1, position: 8 },
        slot_revision: '0',
      },
      'me',
      'home',
    ),
  ).toBe('')
  expect(dispatchFailure(new Error('PositionOccupied'))).toBe(
    'This position is occupied. Choose an empty position.',
  )
})
