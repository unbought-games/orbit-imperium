import type { components } from '../contracts'
import type { LocationKind } from '../shell/location-address'
type S = components['schemas']

export function ownedDestinationPlanets(bodies: S['BodyV3'][], origin: string) {
  return bodies.filter((body) => body.kind === 'Planet' && body.id !== origin)
}

export function destinationBody(
  view: S['BoundView4'],
  coordinates: S['Coordinates'] | null,
  kind: LocationKind,
  observation?: S['GalaxySystem4'],
) {
  if (!coordinates || kind === 'debris') return undefined
  const owned = view.bodies.find(
    (body) =>
      body.kind.toLowerCase() === kind &&
      body.coordinates.galaxy === coordinates.galaxy &&
      body.coordinates.system === coordinates.system &&
      body.coordinates.position === coordinates.position,
  )
  if (owned) return { ...owned, owner: view.binding.player }
  if (
    observation?.galaxy !== coordinates.galaxy ||
    observation.system !== coordinates.system
  )
    return undefined
  const body = observation.positions.find(
    (position) => position.coordinates.position === coordinates.position,
  )?.body
  return body?.kind.toLowerCase() === kind ? body : undefined
}
