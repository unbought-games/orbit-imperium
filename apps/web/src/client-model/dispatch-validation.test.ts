import { expect, it } from 'vitest'
import type { components } from '../contracts'
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
  'PrerequisiteMissing',
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

const colonizeIntent = (
  position: number,
): components['schemas']['FleetIntent4'] => ({
  origin: 'home',
  mission: 'Colonize',
  destination: {
    type: 'EmptyPosition',
    coordinates: { galaxy: 1, system: 1, position },
    slot_revision: '0',
  },
  ships: [{ owner: 'me', ship_type: 'ColonyShip', count: '1' }],
  cargo: { metal: '0', crystal: '0', deuterium: '0' },
  speed_percent: 100,
})
it.each(
  [8, 6, 4, 1, 1, 1, 1, 1, 1, 1, 1, 1, 4, 6, 8].map((level, index) => [
    index + 1,
    level,
  ]),
)(
  'explains the Astrophysics gate for position %i at level %i',
  (position, level) => {
    const message = `Astrophysics level ${level} is required for this position.`
    expect(
      dispatchFailure('PrerequisiteMissing', colonizeIntent(position)),
    ).toBe(message)
    expect(
      dispatchFailure(
        new Error('PrerequisiteMissing'),
        colonizeIntent(position),
      ),
    ).toBe(message)
  },
)
it('uses a general requirement message when colony position context is unavailable', () => {
  const message =
    'Your empire does not meet the requirements for this mission. Check your research and review again.'
  expect(dispatchFailure('PrerequisiteMissing')).toBe(message)
  expect(dispatchFailure('PrerequisiteMissing', colonizeIntent(0))).toBe(
    message,
  )
  expect(
    dispatchFailure('PrerequisiteMissing', {
      ...colonizeIntent(3),
      mission: 'Transport',
    }),
  ).toBe(message)
})
