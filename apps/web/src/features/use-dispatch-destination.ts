import { useEffect, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { LocationKind } from '../shell/location-address'
import {
  destinationBody,
  ownedDestinationPlanets,
} from './dispatch-destination'
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
  const enabled = !!coordinates && kind !== 'debris'
  useEffect(() => {
    if (!enabled || galaxy === undefined || system === undefined) return
    let current = true
    const timer = setTimeout(() => {
      void model.world({ type: 'Galaxy', galaxy, system }).then(
        (result) => {
          if (current)
            setRead({
              model,
              key,
              revision,
              observation: result && 'positions' in result ? result : undefined,
            })
        },
        () => {
          if (current) setRead({ model, key, revision })
        },
      )
    }, 250)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [model, key, galaxy, system, enabled, revision, mission])
  const currentRead =
    enabled && read?.model === model && read.key === key ? read : null
  const observation = currentRead?.observation
  const target = destinationBody(view, coordinates, kind, observation)
  const planets = ownedDestinationPlanets(view.bodies, origin)
  const selectedPlanet = planets.find((planet) => planet.id === target?.id)
  return {
    target,
    observation,
    refreshing:
      !!currentRead &&
      currentRead.revision !== revision &&
      target?.source !== 'empire',
    planets,
    selectedPlanet,
    lookup: currentRead
      ? observation
        ? ('ready' as const)
        : ('unavailable' as const)
      : ('loading' as const),
  }
}
