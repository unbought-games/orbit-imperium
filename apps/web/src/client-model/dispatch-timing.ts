import type { components } from '../contracts'
import { dispatchQuantity } from './dispatch-validation'
type S = components['schemas']

/** Preserve seconds when comparing speed choices and round-trip timing. */
export function flightDuration(milliseconds: number): string {
  let seconds = Math.ceil(milliseconds / 1000)
  const parts: string[] = []
  for (const [unit, size] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const count = Math.floor(seconds / size)
    if (count > 0) parts.push(`${count}${unit}`)
    seconds %= size
  }
  return parts.join(' ') || '0s'
}

export function dispatchShips(
  types: S['FleetIntent4']['ships'][number]['ship_type'][],
  values: Record<string, string>,
  owner: string,
): S['FleetIntent4']['ships'] {
  return types.flatMap((ship_type) => {
    const count = dispatchQuantity(values[ship_type])
    return BigInt(count) > 0n ? [{ owner, ship_type, count }] : []
  })
}
export function dispatchSelection(
  mission: S['FleetIntent4']['mission'],
  coordinates: S['Coordinates'],
): S['DestinationSelection4'] {
  return mission === 'Harvest'
    ? { type: 'DebrisAt', coordinates }
    : mission === 'Colonize'
      ? { type: 'EmptyPositionAt', coordinates }
      : { type: 'BodyAt', coordinates, kind: 'Planet' }
}
export function flightSchedule(
  duration: number,
  departure: number,
  mission: S['FleetIntent4']['mission'],
) {
  const total = mission === 'Deploy' ? duration : 2 * duration
  return {
    arrival: departure + duration,
    returnAt: mission === 'Deploy' ? null : departure + total,
    total,
  }
}
