import type { components } from '../contracts'
import type { GameState } from './game-store'
import {
  activeAttempt,
  occupiedFleetSlots,
  pendingFleetLaunches,
  projectGameView,
} from './game-projection'

type S = components['schemas']
export type GalaxyFlight = {
  id: string
  mission: S['Mission4']
  dueAt: number | null
  phase: 'en route' | 'returning' | 'departure pending'
}

function targets(intent: S['FleetIntent4'], position: S['GalaxyPosition4']) {
  const destination = intent.destination
  if (destination.type === 'Body') return destination.id === position.body?.id
  const a = destination.coordinates,
    b = position.coordinates
  return (
    a.galaxy === b.galaxy && a.system === b.system && a.position === b.position
  )
}

/** Direction follows the current leg; a returning fleet heads home, not at its old target. */
export function galaxyFlights(
  state: GameState,
  position: S['GalaxyPosition4'],
): GalaxyFlight[] {
  if (state.view?.protocol !== 4) return []
  const confirmed = state.view.missions.fleets
  const flights: GalaxyFlight[] = confirmed.flatMap((fleet) => {
    const returning = fleet.leg === 'Returning'
    if (
      returning
        ? fleet.intent.origin !== position.body?.id
        : !targets(fleet.intent, position)
    )
      return []
    return [
      {
        id: fleet.id,
        dueAt: fleet.due_at,
        mission: fleet.intent.mission,
        phase: returning ? 'returning' : 'en route',
      },
    ]
  })
  for (const pending of pendingFleetLaunches(state)) {
    const command = pending.attempt.envelope.command
    if (command.type !== 'World' || command.action.type !== 'LaunchFleet')
      continue
    if (
      !targets(command.action.intent, position) ||
      confirmed.some((fleet) => fleet.id === pending.fleetId)
    )
      continue
    flights.push({
      id: pending.attempt.envelope.command_id,
      dueAt: null,
      mission: command.action.intent.mission,
      phase: 'departure pending',
    })
  }
  return flights
}

export function pendingProbe(state: GameState, origin: string, target: string) {
  return [...state.attempts.values()].some((attempt) => {
    const command = attempt.envelope.command
    return (
      activeAttempt(attempt, state.view) &&
      command.type === 'World' &&
      command.action.type === 'LaunchFleet' &&
      command.action.intent.mission === 'Espionage' &&
      command.action.intent.origin === origin &&
      command.action.intent.destination.type === 'Body' &&
      command.action.intent.destination.id === target
    )
  })
}

export function probeAvailability(
  state: GameState,
  origin: string,
): string | null {
  if (!state.ready || state.stale || state.view?.protocol !== 4)
    return 'Reconnect before sending a probe.'
  if (
    !state.view.capabilities.some(
      (c) => c.capability === 'Espionage' && c.enabled,
    )
  )
    return 'Espionage is unavailable in this universe.'
  const body = projectGameView(state)?.bodies.find((b) => b.id === origin)
  const count =
    body?.inventories.find(
      (item) => item.item.kind === 'Ship' && item.item.id === 'EspionageProbe',
    )?.count ?? '0'
  if (BigInt(count) < 1n)
    return 'No espionage probes available on the selected planet.'
  if (
    BigInt(occupiedFleetSlots(state)) >= BigInt(state.view.missions.fleet_slots)
  )
    return 'All fleet slots are occupied.'
  return null
}
