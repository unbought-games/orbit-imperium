import { expect, it } from 'vitest'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { galaxyFlightPresentation } from './galaxy-flight-presentation'
const flight = (
  dueAt: number | null,
  phase: GalaxyFlight['phase'] = 'en route',
): GalaxyFlight => ({ id: 'a', mission: 'Espionage', dueAt, phase })

it.each([
  [0, 'Due'],
  [1, '1s'],
  [59_000, '59s'],
  [60_000, '1m'],
  [61_000, '2m'],
  [3600_000, '1h'],
  [86400_000, '1d'],
])('keeps the next-arrival marker bounded for %i ms', (remaining, arrival) => {
  expect(
    galaxyFlightPresentation([flight(1000 + remaining)], 1000).arrival,
  ).toBe(arrival)
})
it('uses the earliest confirmed arrival without inventing a pending departure time', () => {
  expect(
    galaxyFlightPresentation([flight(null, 'departure pending')], 1000),
  ).toEqual({
    arrival: '…',
    count: '1',
    phase: 'pending',
    description: '1 fleet departure pending.',
  })
  expect(
    galaxyFlightPresentation(
      [flight(121000), flight(null, 'departure pending'), flight(31000)],
      1000,
    ),
  ).toEqual({
    arrival: '30s',
    count: '3',
    phase: 'en route',
    description:
      '2 fleets en route. 1 fleet departure pending. Next arrival: 30s.',
  })
  expect(
    galaxyFlightPresentation([flight(121000, 'returning')], 1000).phase,
  ).toBe('returning')
})
it('keeps large counts compact while the details retain the full collection', () => {
  expect(
    galaxyFlightPresentation(
      Array.from({ length: 100 }, () => flight(2000)),
      1000,
    ).count,
  ).toBe('99+')
  expect(galaxyFlightPresentation([], 1000).count).toBe('0')
  expect(galaxyFlightPresentation([flight(2000)]).arrival).toBe('…')
})

it('describes idle, returning and unabridged fleet counts without opening details', () => {
  expect(galaxyFlightPresentation([]).description).toBe(
    'No fleets heading to this position.',
  )
  expect(
    galaxyFlightPresentation([flight(121000, 'returning')], 1000).description,
  ).toBe('1 fleet returning. Next arrival: 2m 0s.')
  expect(
    galaxyFlightPresentation(
      Array.from({ length: 100 }, () => flight(0)),
      1000,
    ).description,
  ).toBe('100 fleets en route. Next arrival: Awaiting confirmation.')
})
