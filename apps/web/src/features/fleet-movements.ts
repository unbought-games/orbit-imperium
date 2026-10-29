import type { components } from '../contracts'
type S = components['schemas']
type Movement<T> =
  | { kind: 'fleet'; key: string; arrival: number; flight: T }
  | {
      kind: 'missile'
      key: string
      arrival: number
      flight: S['MissileFlightView4']
    }
const byArrival = (a: { arrival: number }, b: { arrival: number }) =>
  a.arrival - b.arrival

/** Presentation only: missiles share movement lists, never fleet slots or recall. */
export function outgoingMovements(view: S['BoundView4'], item: string | null) {
  const rows: Movement<S['OwnMission4']>[] = [
    ...view.missions.fleets.map((flight) => ({
      kind: 'fleet' as const,
      key: flight.id,
      arrival: flight.due_at,
      flight,
    })),
    ...(view.missiles ?? [])
      .filter((flight) => flight.outgoing)
      .map((flight) => ({
        kind: 'missile' as const,
        key: flight.id,
        arrival: flight.arrival_at,
        flight,
      })),
  ]
  return rows.filter((row) => !item || row.flight.id === item).sort(byArrival)
}
export function incomingMovements(view: S['BoundView4']) {
  const rows: Movement<S['IncomingMission4']>[] = [
    ...view.missions.incoming.map((flight, index) => ({
      kind: 'fleet' as const,
      key: `fleet:${index}`,
      arrival: flight.arrival_at,
      flight,
    })),
    ...(view.missiles ?? [])
      .filter((flight) => !flight.outgoing)
      .map((flight) => ({
        kind: 'missile' as const,
        key: flight.id,
        arrival: flight.arrival_at,
        flight,
      })),
  ]
  return rows.sort(byArrival)
}
