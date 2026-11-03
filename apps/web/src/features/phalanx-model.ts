import type { components } from '../contracts'
type S = components['schemas']
export const scanCost = '5000000000'
export function phalanxRange(level: number) {
  return BigInt(level) ** 2n - 1n
}
export function scanBlocker(
  source:
    | Pick<S['BodyV3'], 'kind' | 'levels' | 'coordinates' | 'amounts'>
    | undefined,
  target: S['GalaxyPosition4'],
  player: string | undefined,
) {
  if (!source || source.kind !== 'Moon' || !source.levels.SensorPhalanx)
    return 'Complete Sensor Phalanx level 1 on this moon first.'
  if (!target.body || target.body.kind !== 'Planet')
    return 'Select an occupied planet.'
  if (target.body.owner === player) return 'You cannot scan your own planets.'
  if (target.body.vacation) return 'This player is on vacation.'
  if (
    source.coordinates.galaxy !== target.coordinates.galaxy ||
    BigInt(Math.abs(source.coordinates.system - target.coordinates.system)) >
      phalanxRange(source.levels.SensorPhalanx)
  )
    return 'This planet is outside this moon’s scan range.'
  if (BigInt(source.amounts.deuterium) < BigInt(scanCost))
    return 'This moon needs 5,000 deuterium locally.'
  return null
}
