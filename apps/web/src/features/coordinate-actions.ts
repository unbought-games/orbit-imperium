import type { BoundView } from '../client-model/commands'
import type { LocationKind, LocationMission } from '../shell/location-address'
import type { components } from '../contracts'
type Coordinates = components['schemas']['Coordinates']
export function coordinateMissions(
  view: BoundView,
  at: Coordinates,
  kind: LocationKind,
  known?: {
    owner?: string
    empty?: boolean
    abandoned?: boolean
    debris?: boolean
  },
) {
  if (view.protocol !== 4) return []
  const own = view.bodies.find(
    (b) =>
      b.kind.toLowerCase() === kind &&
      b.coordinates.galaxy === at.galaxy &&
      b.coordinates.system === at.system &&
      b.coordinates.position === at.position,
  )
  const owner = own ? view.binding.player : known?.owner
  const missions: LocationMission[] =
    known?.abandoned && kind !== 'debris'
      ? []
      : kind === 'debris'
        ? ['Harvest']
        : owner === view.binding.player
          ? ['Transport', 'Deploy']
          : known?.empty && kind === 'planet'
            ? ['Colonize']
            : ['Attack', 'Espionage', 'Transport']
  if (known?.debris && kind !== 'debris') missions.push('Harvest')
  return missions.filter((m) =>
    view.capabilities.some((c) => c.capability === m && c.enabled),
  )
}
