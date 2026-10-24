import type { BoundView } from './commands'

// Stay active until the server removes the threat, including while disconnected.
export function hasIncomingHostileFleet(view: BoundView): boolean {
  return (
    view.protocol === 4 &&
    view.missions.incoming.some(
      ({ mission }) => mission === 'Attack' || mission === 'Espionage',
    )
  )
}
