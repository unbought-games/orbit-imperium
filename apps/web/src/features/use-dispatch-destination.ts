import { currentDispatchRead, startDispatchObservation } from './dispatch-reads'
import { useEffect, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { LocationKind } from '../shell/location-address'
import { destinationBody, ownedDestinationBodies } from './dispatch-destination'
type S = components['schemas']

/** Tag advisory reads with their source; never render a previous request as current. */
export function useDispatchDestination(
  model: Coordinator,
  view: S['BoundView4'],
  origin: string,
  coordinates: S['Coordinates'] | null,
  kind: LocationKind,
  mission: S['Mission4'],
) {
  const galaxy = coordinates?.galaxy
  const system = coordinates?.system
  const revision = view.viewer_revision
  const [read, setRead] = useState<{
    model: Coordinator
    key: string
    revision: string
    observation?: S['GalaxySystem4']
  } | null>(null)
  const key = `${galaxy}:${system}`
  const enabled = !!coordinates
  useEffect(() => {
    if (!enabled || galaxy === undefined || system === undefined) return
    let request: ReturnType<typeof startDispatchObservation> | undefined
    const timer = setTimeout(() => {
      request = startDispatchObservation(
        (query) => model.world(query),
        galaxy,
        system,
        (observation) => setRead({ model, key, revision, observation }),
      )
    }, 250)
    return () => {
      request?.cancel()
      clearTimeout(timer)
    }
  }, [model, key, galaxy, system, enabled, revision, mission])
  const currentRead = currentDispatchRead(model, enabled ? key : null, read)
  const observation = currentRead?.observation
  const target = destinationBody(view, coordinates, kind, observation)
  const position =
    observation?.galaxy === galaxy && observation?.system === system
      ? observation?.positions.find(
          (p) => p.coordinates.position === coordinates?.position,
        )
      : undefined
  const problem =
    currentRead?.revision === revision && position
      ? mission === 'Harvest' && !position.debris
        ? 'There is no available debris field here. Choose a current debris field in Galaxy.'
        : mission === 'Colonize' && position.body
          ? 'This position is occupied. Choose an empty position.'
          : ''
      : ''
  const bodies = ownedDestinationBodies(view.bodies, origin)
  const selectedBody = bodies.find((planet) => planet.id === target?.id)
  return {
    target,
    observation,
    problem,
    bodies,
    selectedBody,
    lookup: currentRead
      ? observation
        ? ('ready' as const)
        : ('unavailable' as const)
      : ('loading' as const),
  }
}
