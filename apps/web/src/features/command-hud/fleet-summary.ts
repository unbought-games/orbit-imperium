import type { GameState } from '../../client-model/game-store'
import {
  activeAttempt,
  acceptedEntityReference,
  pendingCommand,
} from '../../client-model/game-projection'
import type { components } from '../../contracts'
import type { BodyArtIdentity } from '../../ui/artwork'
import { coordinates } from '../../ui/format'
import { arrivalCountdown } from '../mission-presentation'
import { isHostileMission } from '../../client-model/hostile-fleets'
import { incomingAttacks, incomingKey } from './model'

type S = components['schemas']
export type FleetEndpoint = {
  name: string
  address: string
  art?: BodyArtIdentity
  kind: 'Planet' | 'Moon' | 'Debris' | 'EmptyPosition' | 'Unknown'
}
export type FleetSummaryRow = {
  key: string
  id?: string
  origin: string
  mission: S['Mission4']
  leg: S['OwnMission4']['leg'] | 'Launching' | 'Incoming'
  ships: S['PublicShip4'][]
  home: FleetEndpoint
  target: FleetEndpoint
  dueAt: number | null
  duration: number | null
  status?: string
}

function endpoint(
  view: S['BoundView4'],
  id: string | undefined,
  at: S['Coordinates'] | undefined,
  kind: FleetEndpoint['kind'],
): FleetEndpoint {
  const body = [...view.bodies, ...view.destinations].find(
    (body) => body.id === id,
  )
  const location = at ?? body?.coordinates
  const bodyKind = body?.kind ?? kind
  return {
    name:
      body?.name ??
      (bodyKind === 'EmptyPosition'
        ? 'Empty position'
        : bodyKind === 'Debris'
          ? 'Debris field'
          : bodyKind === 'Unknown'
            ? 'Unavailable'
            : bodyKind),
    address: location
      ? coordinates({ coordinates: location })
      : 'Coordinates unavailable',
    kind: bodyKind,
    art:
      location && (bodyKind === 'Planet' || bodyKind === 'Moon')
        ? {
            id: id ?? coordinates({ coordinates: location }),
            kind: bodyKind,
            coordinates: location,
          }
        : undefined,
  }
}

/** Confirmed mission facts shared by the Orb and the active fleet cards. */
export function ownFleetSummary(
  view: S['BoundView4'],
  fleet: S['OwnMission4'],
): FleetSummaryRow {
  return {
    key: fleet.id,
    id: fleet.id,
    origin: fleet.intent.origin,
    mission: fleet.intent.mission,
    leg: fleet.leg,
    ships: fleet.ships,
    home: endpoint(view, fleet.intent.origin, fleet.origin, 'Planet'),
    target: endpoint(
      view,
      fleet.intent.destination.type === 'Body'
        ? fleet.intent.destination.id
        : undefined,
      fleet.destination,
      fleet.intent.destination.type === 'Body'
        ? fleet.intent.destination.expected_kind
        : fleet.intent.destination.type,
    ),
    dueAt: fleet.due_at,
    duration: fleet.duration_ms,
  }
}

/** Empire-wide facts derived from the snapshot and unreconciled departures. */
export function fleetSummaryRows(state: GameState): FleetSummaryRow[] {
  const view = state.view
  if (view?.protocol !== 4) return []
  const confirmed = view.missions.fleets.map((fleet) =>
    ownFleetSummary(view, fleet),
  )
  const pending = [...state.attempts.values()].flatMap(
    (attempt): FleetSummaryRow[] => {
      const command = attempt.envelope.command
      if (
        !activeAttempt(attempt, view) ||
        command.type !== 'World' ||
        command.action.type !== 'LaunchFleet'
      )
        return []
      const { intent } = command.action
      const fleetId = acceptedEntityReference(state, attempt)
      const recalling =
        !!fleetId &&
        pendingCommand(state, {
          type: 'World',
          action: { type: 'RecallMission', fleet: fleetId },
        })
      return [
        {
          key: attempt.envelope.command_id,
          id: fleetId ?? undefined,
          origin: intent.origin,
          mission: intent.mission,
          leg: 'Launching',
          ships: intent.ships,
          home: endpoint(view, intent.origin, undefined, 'Unknown'),
          target: endpoint(
            view,
            intent.destination.type === 'Body'
              ? intent.destination.id
              : undefined,
            intent.destination.type === 'Body'
              ? undefined
              : intent.destination.coordinates,
            intent.destination.type === 'Body'
              ? intent.destination.expected_kind
              : intent.destination.type,
          ),
          dueAt: null,
          duration: null,
          status: recalling
            ? 'Recall requested'
            : attempt.status === 'uncertain'
              ? 'Awaiting confirmation'
              : 'Confirming departure',
        },
      ]
    },
  )
  return [...confirmed, ...pending].sort(
    (a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
  )
}

/** Sum decimal counts exactly, including fleets larger than JS's safe integer range. */
export function fleetShipCount(ships: S['PublicShip4'][]) {
  return ships.reduce((total, ship) => total + BigInt(ship.count), 0n)
}

/** Marker position follows paid flight duration; early recalls turn back before the target. */
export function fleetFlight(row: FleetSummaryRow, now: number) {
  const returning = row.leg === 'Returning' || row.leg === 'Incoming'
  const unknownPosition = row.leg === 'Incoming' && row.duration === null
  const remaining = row.dueAt === null ? null : Math.max(0, row.dueAt - now)
  const fraction =
    remaining === null
      ? 1
      : row.duration && row.duration > 0
        ? remaining / row.duration
        : 0
  const position = Math.max(0, Math.min(1, returning ? fraction : 1 - fraction))
  return {
    position: unknownPosition ? null : position,
    x: unknownPosition ? 160 : 16 + 288 * position,
    y: 14,
    angle: returning ? 225 : 45,
    label:
      row.dueAt !== null && row.dueAt > now
        ? row.leg === 'Returning'
          ? 'Home in'
          : 'Arrives in'
        : null,
    time: row.dueAt === null ? row.status : arrivalCountdown(row.dueAt, now),
  }
}

export function ownFleetTone(mission: S['Mission4']) {
  return isHostileMission(mission) ? 'attack' : 'peaceful'
}

/** Incoming snapshots expose arrival and intelligence, never departure time or progress. */
export function incomingFleetSummary(
  view: S['BoundView4'],
  fleet: S['IncomingMission4'],
): FleetSummaryRow {
  return {
    key: incomingKey(fleet),
    origin: fleet.target,
    mission: fleet.mission,
    leg: 'Incoming',
    ships: fleet.ships.visibility === 'Exact' ? fleet.ships.ships : [],
    home: endpoint(view, fleet.target, undefined, 'Planet'),
    target: {
      name: 'Unknown origin',
      address: coordinates({ coordinates: fleet.origin }),
      kind: 'Unknown',
    },
    dueAt: fleet.arrival_at,
    duration: null,
  }
}

export function enemyAttackRows(state: GameState) {
  const view = state.view
  if (view?.protocol !== 4) return []
  return incomingAttacks(state)
    .map((fleet) => ({ fleet, row: incomingFleetSummary(view, fleet) }))
    .sort((a, b) => a.fleet.arrival_at - b.fleet.arrival_at)
}
