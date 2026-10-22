import type { BoundView } from '../client-model/commands'
import { resourceNames } from '../client-model/resources'
import { coordinates, label } from '../ui/format'

export type EmpireFlight = {
  key: string
  item?: string
  mission: string
  leg: 'Incoming' | 'Outbound' | 'Returning'
  from?: string
  to?: string
  route: string
  due: number
  ships: string
  hostile: boolean
}

const shipSummary = (ships: { count: string; ship_type: string }[]) =>
  ships.map((ship) => `${ship.count} ${label(ship.ship_type)}`).join(' · ')

/** One record per visible flight. Body IDs, never shared coordinates, identify traffic. */
export function empireFlights(view: BoundView): EmpireFlight[] {
  const location = (id: string) => {
    const body = [...view.bodies, ...view.destinations].find((b) => b.id === id)
    return body ? coordinates(body) : 'Unrevealed location'
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
          hostile: false,
        }
      })
      .sort((a, b) => a.due - b.due)
  const owned = view.missions.fleets.map((f): EmpireFlight => {
    const returning = f.leg === 'Returning'
    const destination =
      f.intent.destination.type === 'Body' ? f.intent.destination.id : undefined
    const originLabel = coordinates({ coordinates: f.origin })
    const targetLabel = coordinates({ coordinates: f.destination })
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
      hostile: false,
    }
  })
  const incoming = view.missions.incoming.map(
    (f, index): EmpireFlight => ({
      key: `incoming:${index}`,
      mission: label(f.mission),
      leg: 'Incoming',
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
      hostile: f.mission === 'Attack',
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

/** BigInt arithmetic preserves the server's micro-resource precision. */
export function empireTotals(view: BoundView) {
  return Object.fromEntries(
    resourceNames.map((name) => [
      name,
      view.bodies
        .reduce((sum, b) => sum + BigInt(b.amounts[name]), 0n)
        .toString(),
    ]),
  ) as Record<(typeof resourceNames)[number], string>
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
