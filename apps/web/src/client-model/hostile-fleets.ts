import type { BoundView } from './commands'

export function isAttackMission(mission: string): boolean {
  return mission === 'Attack' || mission === 'DestroyMoon'
}

export function isHostileMission(mission: string): boolean {
  return isAttackMission(mission) || mission === 'Espionage'
}

// Stay active until the server removes the threat, including while disconnected.
export function incomingThreatKind(view: BoundView) {
  if (view.protocol !== 4) return null
  if (view.missiles?.some((flight) => !flight.outgoing)) return 'missile'
  const { incoming } = view.missions
  if (incoming.some(({ mission }) => isAttackMission(mission))) return 'attack'
  if (incoming.some(({ mission }) => mission === 'Espionage'))
    return 'espionage'
  return null
}
