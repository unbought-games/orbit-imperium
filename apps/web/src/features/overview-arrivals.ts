import type { BoundView } from '../client-model/commands'
import { coordinates, label } from '../ui/format'

export function overviewArrivals(view: BoundView, bodyId: string) {
  const body = view.bodies.find((body) => body.id === bodyId)
  if (!body) return []
  if (view.protocol !== 4) {
    const location = (id: string) => {
      const destination = [...view.bodies, ...view.destinations].find(
        (entry) => entry.id === id,
      )
      return destination ? coordinates(destination) : 'Unrevealed location'
    }
    return view.fleets
      .filter(
        (fleet) =>
          fleet.status !== 'Completed' &&
          (fleet.origin === bodyId || fleet.target === bodyId),
      )
      .map((fleet) => ({
        key: fleet.id,
        item: fleet.id,
        mission: `Transport · ${fleet.status}`,
        sender: undefined as string | undefined,
        route:
          fleet.status === 'Returning'
            ? `${location(fleet.target)} → ${location(fleet.origin)}`
            : `${location(fleet.origin)} → ${location(fleet.target)}`,
        due: fleet.due_at,
        ships: fleet.ships
          .map((ship) => `${ship.count} ${label(ship.ship_type)}`)
          .join(' · '),
      }))
      .sort((a, b) => a.due - b.due)
  }
  const incoming = view.missions.incoming
    .filter((fleet) => fleet.target === bodyId)
    .map((fleet, index) => ({
      key: `incoming:${index}`,
      item: undefined as string | undefined,
      mission: `${fleet.mission} · Incoming`,
      sender: fleet.sender,
      route: `${coordinates({ coordinates: fleet.origin })} → ${coordinates(body)}`,
      due: fleet.arrival_at,
      ships:
        fleet.ships.visibility === 'Unknown'
          ? 'Ship composition unknown'
          : fleet.ships.visibility === 'Total'
            ? `${fleet.ships.total} ships · Types unknown`
            : fleet.ships.visibility === 'Types'
              ? `${fleet.ships.total} ships · ${fleet.ships.types.map(label).join(', ')}`
              : fleet.ships.ships
                  .map((ship) => `${ship.count} ${label(ship.ship_type)}`)
                  .join(' · '),
    }))
  const owned = view.missions.fleets
    .filter(
      (fleet) =>
        fleet.intent.origin === bodyId ||
        (fleet.intent.destination.type === 'Body' &&
          fleet.intent.destination.id === bodyId),
    )
    .map((fleet) => ({
      key: fleet.id,
      item: fleet.id,
      mission: `${fleet.intent.mission} · ${fleet.leg}`,
      sender: undefined as string | undefined,
      route:
        fleet.leg === 'Returning'
          ? `${coordinates({ coordinates: fleet.destination })} → ${coordinates({ coordinates: fleet.origin })}`
          : `${coordinates({ coordinates: fleet.origin })} → ${coordinates({ coordinates: fleet.destination })}`,
      due: fleet.due_at,
      ships: fleet.ships
        .map((ship) => `${ship.count} ${label(ship.ship_type)}`)
        .join(' · '),
    }))
  return [...incoming, ...owned].sort((a, b) => a.due - b.due)
}
