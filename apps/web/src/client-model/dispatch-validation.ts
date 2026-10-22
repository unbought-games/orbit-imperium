import type { components } from '../contracts'
import { positionAstrophysics } from './colonization'
type S = components['schemas']
export type CoordinateField = 'galaxy' | 'system' | 'position'

export function coordinateErrors(
  values: Record<CoordinateField, string>,
  settings: Pick<
    S['BoundSettings4'],
    'galaxies' | 'systems_per_galaxy' | 'positions_per_system'
  > | null,
): Record<CoordinateField, string> {
  const limits = {
    galaxy: settings?.galaxies,
    system: settings?.systems_per_galaxy,
    position: settings?.positions_per_system,
  }
  const error = (field: CoordinateField) => {
    const value = values[field]
    const max = limits[field]
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
      return `Enter a whole ${field} number${max ? ` from 1 to ${max}` : ' greater than 0'}.`
    if (max !== undefined && Number(value) > max)
      return `Enter a ${field} number from 1 to ${max}.`
    return ''
  }
  return {
    galaxy: error('galaxy'),
    system: error('system'),
    position: error('position'),
  }
}

export function destinationError(
  mission: S['FleetIntent4']['mission'],
  destination: S['MissionDestination4'],
  player: string,
  origin: string,
): string {
  if (destination.type !== 'Body') return ''
  if (
    destination.expected_owner === player &&
    (mission === 'Attack' || mission === 'Espionage')
  )
    return mission === 'Attack'
      ? 'You cannot attack your own planet. Choose another player’s planet, or use Transport to send resources to another of your planets.'
      : 'You cannot spy on your own planet. Choose another player’s planet.'
  if (destination.id === origin)
    return 'This is your departure planet. Choose a different destination.'
  return ''
}

const messages: Partial<Record<S['GameError4'], string>> = {
  PrerequisiteMissing:
    'Your empire does not meet the requirements for this mission. Check your research and review again.',
  PositionOccupied: 'This position is occupied. Choose an empty position.',
  BeginnerProtected:
    'Beginner protection prevents this mission between these players. Choose another target. Protection depends on both players’ strength and activity; review checks it again.',
  TargetVacation:
    'This player is in vacation mode. Choose another target or try again after they return.',
  ActorVacation:
    'You are in vacation mode. Leave vacation mode before sending a fleet.',
  ActorDraining: 'Your account is being removed and cannot send new fleets.',
  PolicyUnavailable:
    'Mission eligibility could not be checked. Try reviewing again after reconnecting.',
  PresenceUnavailable:
    'Your activity could not be confirmed. Reconnect and review the mission again.',
  QuoteChanged:
    'The destination or fleet terms have changed. Review the mission again before sending.',
  NotFound:
    'The destination is no longer available. Check the coordinates or choose a current target in Galaxy.',
  NotOwned:
    'The departure planet or ships are no longer yours. Choose a current departure planet and review again.',
  InvalidInput:
    'This mission is not valid. Check the destination, select ships suitable for the mission, and review again.',
  NumericRange:
    'One of the entered amounts is too large. Reduce the ship or cargo amounts and review again.',
  InsufficientShips:
    'These ships are no longer available. Update your fleet selection and review again.',
  InsufficientResources:
    'There are not enough resources for cargo and fuel. Reduce the cargo or fleet and review again.',
  NoFleetSlot:
    'All fleet slots are occupied. Wait for a fleet to return before trying again.',
  CargoCapacity:
    'The fleet cannot carry this cargo and fuel. Add cargo ships or reduce the cargo.',
  NoHarvestTarget:
    'There is no available debris field here. Choose a current debris field in Galaxy.',
  UnavailableContent:
    'This mission is unavailable in this universe. Choose another mission.',
}

export function dispatchFailure(
  error: unknown,
  intent?: S['FleetIntent4'],
): string {
  const code =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : ''
  if (
    code === 'PrerequisiteMissing' &&
    intent?.mission === 'Colonize' &&
    intent.destination.type === 'EmptyPosition'
  ) {
    const required = positionAstrophysics(
      intent.destination.coordinates.position,
    )
    if (required !== null)
      return `Astrophysics level ${required} is required for this position.`
  }
  if (code === 'InvalidInput' && intent) {
    const ownError = destinationError(
      intent.mission,
      intent.destination,
      intent.ships[0]?.owner ?? '',
      intent.origin,
    )
    if (ownError) return ownError
  }
  return (
    messages[code as S['GameError4']] ??
    'Unable to validate this mission. Check your connection and review again.'
  )
}
