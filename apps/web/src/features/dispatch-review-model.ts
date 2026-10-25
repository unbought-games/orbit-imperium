import type { components } from '../contracts'
import { coordinateText } from '../shell/location-address'
import { shipManifest } from './mission-presentation'
type S = components['schemas']
export type DispatchTarget = Pick<
  S['PublicBody4'],
  'id' | 'owner' | 'kind' | 'name'
>

/** An advisory observation can name only the identity confirmed by this quote. */
export function reviewDestination(
  destination: S['MissionDestination4'],
  coordinates: S['Coordinates'],
  target?: DispatchTarget,
) {
  if (destination.type !== 'Body')
    return {
      name: destination.type === 'Debris' ? 'Debris field' : 'Empty position',
      coordinates: destination.coordinates,
      kind:
        destination.type === 'Debris'
          ? ('debris' as const)
          : ('planet' as const),
      owner: undefined,
    }
  const matches =
    target?.id === destination.id &&
    target.owner === destination.expected_owner &&
    target.kind === destination.expected_kind
  return {
    name:
      matches && target.name
        ? target.name
        : `${matches ? 'Unnamed' : 'Unknown'} ${destination.expected_kind.toLowerCase()}`,
    coordinates,
    kind:
      destination.expected_kind === 'Moon'
        ? ('moon' as const)
        : ('planet' as const),
    owner: destination.expected_owner,
  }
}

export function dispatchSendLabel(
  intent: S['FleetIntent4'],
  destination: ReturnType<typeof reviewDestination>,
) {
  if (intent.mission === 'Transport' || intent.mission === 'Deploy')
    return `${intent.mission} to ${destination.name} [${coordinateText(destination.coordinates)}]`
  const verb = {
    Attack: 'Attack',
    Espionage: 'Spy',
    Harvest: 'Harvest',
    Colonize: 'Colonize',
  }[intent.mission]
  const count = intent.ships.reduce((sum, ship) => sum + BigInt(ship.count), 0n)
  const manifest =
    intent.ships.length === 1 ? shipManifest(intent.ships) : `${count} ships`
  return `${verb} with ${manifest}`
}

export const missionReturn = {
  Transport: {
    label: 'Estimated return',
    note: 'Ships return after delivering cargo.',
  },
  Deploy: {
    label: 'No scheduled return',
    note: 'Successful deployment transfers ships and cargo permanently; half the paid fuel is credited, rounded down.',
  },
  Attack: {
    label: 'Return if surviving',
    note: 'Combat may destroy ships. Only surviving ships return.',
  },
  Espionage: {
    label: 'Return if surviving',
    note: 'Espionage may enter combat. Only surviving ships return; espionage never loots.',
  },
  Harvest: {
    label: 'Estimated return',
    note: 'Harvest depends on debris remaining at arrival.',
  },
  Colonize: {
    label: 'Return if needed',
    note: 'Success consumes one Colony Ship. Escorts and extra Colony Ships return; a lone successful Colony Ship has no return leg. If colonization fails, the fleet returns.',
  },
} satisfies Record<S['Mission4'], { label: string; note: string }>
