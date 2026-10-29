import type { BoundView } from './commands'

export function isHostileMission(mission: string): boolean {
  return mission === 'Attack' || mission === 'Espionage'
}

// Stay active until the server removes the threat, including while disconnected.
export function hasIncomingHostileFleet(view: BoundView): boolean {
  return (
    view.protocol === 4 &&
    (view.missions.incoming.some(({ mission }) => isHostileMission(mission)) ||
      (view.missiles ?? []).some((f) => !f.outgoing))
  )
}
