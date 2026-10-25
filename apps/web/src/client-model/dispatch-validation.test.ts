import { expect, it } from 'vitest'
import type { components } from '../contracts'
import {
  coordinateErrors,
  destinationError,
  dispatchFailure,
  dispatchObservationError,
  dispatchQuantity,
  parsePastedCoordinates,
} from './dispatch-validation'

it.each([undefined, '', ' ', '\t\n', '0'])(
  'treats empty dispatch quantity %j as zero',
  (value) => {
    expect(dispatchQuantity(value)).toBe('0')
  },
)
it.each(['1', '9007199254740993'])(
  'preserves exact dispatch quantity %s',
  (value) => {
    expect(dispatchQuantity(value)).toBe(value)
  },
)
it.each(['-1', '1.5', '1e2', 'no', '01'])(
  'still rejects invalid dispatch quantity %s',
  (value) => {
    expect(() => dispatchQuantity(value)).toThrow(
      'Enter whole nonnegative cargo and ship counts.',
    )
  },
)

it.each([
  '1:372:10',
  ' [ 1 : 372 : 10 ] \n',
  '\t[1:372:10]\u00a0',
  '(1:372:10)',
  '1, 372, 10',
  '1 / 372 / 10',
  '1\t372\n10',
  '[01:0372:010]',
])('parses copied coordinates %j', (text) => {
  expect(parsePastedCoordinates(text)).toEqual({
    galaxy: '1',
    system: '372',
    position: '10',
  })
})
it.each([
  '10',
  ' 10 ',
  '',
  '[1:2]',
  '1:2:3:4',
  '1.5:2:3',
  '-1:2:3',
  'planet 1:2:3',
  '1:2:3 ships',
  '1e1:2:3',
])('leaves ordinary or malformed paste %j alone', (text) => {
  expect(parsePastedCoordinates(text)).toBeNull()
})
it('leaves coordinate range checks to the existing validation without rounding', () => {
  const parsed = parsePastedCoordinates('[0:9007199254740993:16]')!
  expect(parsed).toEqual({
    galaxy: '0',
    system: '9007199254740993',
    position: '16',
  })
  expect(Object.values(coordinateErrors(parsed, settings)).every(Boolean)).toBe(
    true,
  )
})
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

const observedCoordinates = { galaxy: 1, system: 24, position: 5 }
const observedBody = { coordinates: observedCoordinates, target: own }
const bodySelection = {
  type: 'BodyAt' as const,
  coordinates: observedCoordinates,
  kind: 'Planet' as const,
}
it('accepts an unchanged observed colony and a manually entered destination', () => {
  expect(dispatchObservationError(observedBody, bodySelection, own)).toBe('')
  expect(dispatchObservationError(null, bodySelection, own)).toBe('')
  expect(
    dispatchObservationError(
      { coordinates: observedCoordinates },
      bodySelection,
      own,
    ),
  ).toBe('')
})
it.each(['galaxy', 'system', 'position'] as const)(
  'does not apply the old identity after editing %s',
  (field) => {
    expect(
      dispatchObservationError(
        observedBody,
        {
          ...bodySelection,
          coordinates: {
            ...observedCoordinates,
            [field]: observedCoordinates[field] + 1,
          },
        },
        { ...own, id: 'different-colony' },
      ),
    ).toBe('')
  },
)
it.each([
  { ...own, id: 'replacement-colony' },
  { ...own, expected_owner: 'new-owner' },
  { ...own, expected_kind: 'Moon' as const },
  {
    type: 'EmptyPosition' as const,
    coordinates: observedCoordinates,
    slot_revision: '1',
  },
])(
  'rejects a genuinely changed target at the original body selection: %j',
  (destination) => {
    expect(
      dispatchObservationError(observedBody, bodySelection, destination),
    ).toContain('The observed target has changed')
  },
)
it('keeps acquisition and recolonization changes protected at the original coordinates', () => {
  const formerOwner = {
    ...observedBody,
    target: { ...own, expected_owner: 'former-owner' },
  }
  expect(dispatchObservationError(formerOwner, bodySelection, own)).toContain(
    'The observed target has changed',
  )
  expect(
    dispatchObservationError(observedBody, bodySelection, {
      ...own,
      id: 'new-colony',
    }),
  ).toContain('The observed target has changed')
})
it('does not bind a body observation to a deliberately selected debris or empty position', () => {
  expect(
    dispatchObservationError(
      observedBody,
      { type: 'DebrisAt', coordinates: observedCoordinates },
      {
        type: 'Debris',
        coordinates: observedCoordinates,
        field_identity: 'debris',
      },
    ),
  ).toBe('')
  expect(
    dispatchObservationError(
      observedBody,
      { type: 'EmptyPositionAt', coordinates: observedCoordinates },
      {
        type: 'EmptyPosition',
        coordinates: observedCoordinates,
        slot_revision: '1',
      },
    ),
  ).toBe('')
})

it('does not carry planet evidence onto an explicitly selected co-located moon', () => {
  expect(
    dispatchObservationError(
      observedBody,
      { ...bodySelection, kind: 'Moon' },
      { ...own, id: 'moon', expected_kind: 'Moon' },
    ),
  ).toBe('')
})
