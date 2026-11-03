import type { components } from '../contracts'
import type { Attempt } from '../client-model/commands'
type S = components['schemas']
export const scanCost = '5000000000'
/** A new attempt changes status feedback, but does not replace a saved observation. */
export function scanAttempts(
  attempts: Iterable<Attempt>,
  source: string,
  target: string | undefined,
) {
  let attempt: Attempt | undefined
  let report: string | undefined
  for (const candidate of attempts) {
    const command = candidate.envelope.command
    if (
      command.type !== 'World' ||
      command.action.type !== 'ScanPlanet' ||
      command.action.source_moon !== source ||
      command.action.target_planet !== target
    )
      continue
    attempt = candidate
    const receipt = candidate.receipt
    if (receipt?.status === 'Committed' && 'result_ids' in receipt)
      report = receipt.result_ids[0] ?? report
  }
  return { attempt, report }
}
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
