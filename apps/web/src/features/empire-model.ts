import { isHostileMission } from '../client-model/hostile-fleets'
import { missionLocation } from './mission-presentation'
import type { components } from '../contracts'
import type { BoundView } from '../client-model/commands'
import { resourceNames } from '../client-model/resources'
import { coordinates, label } from '../ui/format'

export type EmpireFlight = {
  key: string
  item?: string
  sender?: string
  mission: string
  leg: 'Incoming' | 'Outbound' | 'Returning'
  from?: string
  to?: string
  route: string
  due: number
  ships: string
  cargo?: components['schemas']['Resources']
  hostile: boolean
}

const shipSummary = (ships: { count: string; ship_type: string }[]) =>
  ships.map((ship) => `${ship.count} ${label(ship.ship_type)}`).join(' · ')

/** One record per visible flight. Body IDs, never shared coordinates, identify traffic. */
export function empireFlights(view: BoundView): EmpireFlight[] {
  const location = (id: string) => {
    const body = [...view.bodies, ...view.destinations].find((b) => b.id === id)
    return body
      ? missionLocation(view, id, body.coordinates)
      : 'Unrevealed location'
  }
  if (view.protocol !== 4)
    return view.fleets
      .filter((f) => f.status !== 'Completed')
      .map((f): EmpireFlight => {
        const returning = f.status === 'Returning'
        const from = returning ? f.target : f.origin
        const to = returning ? f.origin : f.target
        return {
          key: f.id,
          item: f.id,
          mission: 'Transport',
          leg: returning ? 'Returning' : 'Outbound',
          from,
          to,
          route: `${location(from)} → ${location(to)}`,
          due: f.due_at,
          ships: shipSummary(f.ships),
          cargo: f.payload,
          hostile: false,
        }
      })
      .sort((a, b) => a.due - b.due)
  const owned = view.missions.fleets.map((f): EmpireFlight => {
    const returning = f.leg === 'Returning'
    const destination =
      f.intent.destination.type === 'Body' ? f.intent.destination.id : undefined
    const originLabel = missionLocation(view, f.intent.origin, f.origin)
    const targetLabel = missionLocation(view, destination, f.destination)
    return {
      key: f.id,
      item: f.id,
      mission: label(f.intent.mission),
      leg: f.leg,
      from: returning ? destination : f.intent.origin,
      to: returning ? f.intent.origin : destination,
      route: returning
        ? `${targetLabel} → ${originLabel}`
        : `${originLabel} → ${targetLabel}`,
      due: f.due_at,
      ships: shipSummary(f.ships),
      cargo: f.cargo,
      hostile: false,
    }
  })
  const incoming = view.missions.incoming.map(
    (f, index): EmpireFlight => ({
      key: `incoming:${index}`,
      mission: label(f.mission),
      leg: 'Incoming',
      sender: f.sender,
      to: f.target,
      route: `${coordinates({ coordinates: f.origin })} → ${location(f.target)}`,
      due: f.arrival_at,
      ships:
        f.ships.visibility === 'Unknown'
          ? 'Ship composition unknown'
          : f.ships.visibility === 'Total'
            ? `${f.ships.total} ships · Types unknown`
            : f.ships.visibility === 'Types'
              ? `${f.ships.total} ships · ${f.ships.types.map(label).join(', ')}`
              : shipSummary(f.ships.ships),
      hostile: isHostileMission(f.mission),
    }),
  )
  return [...owned, ...incoming].sort((a, b) => a.due - b.due)
}

export function bodyTraffic(flights: EmpireFlight[], id: string) {
  return {
    incoming: flights.filter((f) => f.to === id),
    outgoing: flights.filter((f) => f.from === id),
  }
}

/** Sum current owned assets once, never launch intent, spent fuel or foreign traffic. */
export function empireTotals(view: BoundView) {
  const cargo =
    view.protocol === 4
      ? view.missions.fleets.map((fleet) => fleet.cargo)
      : view.fleets
          .filter((fleet) => fleet.status !== 'Completed')
          .map((fleet) => fleet.payload)
  const sum = (amounts: components['schemas']['Resources'][]) =>
    Object.fromEntries(
      resourceNames.map((name) => [
        name,
        amounts
          .reduce((total, resources) => total + BigInt(resources[name]), 0n)
          .toString(),
      ]),
    ) as components['schemas']['Resources']
  const onWorlds = sum(view.bodies.map((body) => body.amounts))
  const inTransit = sum(cargo)
  return { onWorlds, inTransit, total: sum([onWorlds, inTransit]) }
}

/** Older servers may only expose colony metadata; never infer diameter from fields. */
export function planetPhysicalFacts(body: BoundView['bodies'][number]) {
  if (body.kind !== 'Planet') return []
  const colony = 'colony' in body ? body.colony : undefined
  const diameter =
    ('diameter_km' in body ? body.diameter_km : undefined) ??
    colony?.diameter_km
  const minimum =
    ('min_temperature' in body ? body.min_temperature : undefined) ??
    colony?.min_temperature
  const maximum = planetMaxTemperature(body)
  return [
    ...(diameter === undefined ? [] : [`${diameter} km`]),
    ...(minimum === undefined || maximum === undefined
      ? []
      : [`${minimum} to ${maximum} °C`]),
  ]
}

export function storagePercent(amount: string, capacity: string) {
  const cap = BigInt(capacity),
    value = BigInt(amount)
  return cap <= 0n
    ? 0
    : Number(((value < 0n ? 0n : value > cap ? cap : value) * 100n) / cap)
}

/** A schematic layout, deliberately not a map of physical distance. */
export function empireNodes(bodies: BoundView['bodies']) {
  const sorted = [...bodies].sort(
    (a, b) =>
      a.coordinates.galaxy - b.coordinates.galaxy ||
      a.coordinates.system - b.coordinates.system ||
      a.coordinates.position - b.coordinates.position ||
      b.kind.localeCompare(a.kind) ||
      a.id.localeCompare(b.id),
  )
  return sorted.map((body, i) => {
    const column = i % 2
    const count = Math.ceil((sorted.length - column) / 2)
    return {
      body,
      x: column ? 85 : 15,
      y: ((Math.floor(i / 2) + 1) / (count + 1)) * 100,
    }
  })
}

/** Only observed routes between owned bodies are drawn; dense rosters use a list. */
export function empirePaths(
  nodes: ReturnType<typeof empireNodes>,
  flights: EmpireFlight[],
) {
  if (nodes.length > 8) return []
  const byId = new Map(nodes.map((node) => [node.body.id, node]))
  return flights.flatMap((flight) => {
    const from = flight.from ? byId.get(flight.from) : undefined
    const to = flight.to ? byId.get(flight.to) : undefined
    return from && to
      ? [
          {
            key: flight.key,
            path: `M${from.x * 10} ${from.y * 6} Q500 300 ${to.x * 10} ${to.y * 6}`,
          },
        ]
      : []
  })
}

/** Prefer current body state; retained colony metadata supports older servers. */
export function planetMaxTemperature(body: BoundView['bodies'][number]) {
  if (body.kind !== 'Planet') return undefined
  return (
    ('max_temperature' in body ? body.max_temperature : undefined) ??
    ('colony' in body ? body.colony?.max_temperature : undefined)
  )
}
