import { facilityIds } from './progression/catalog-content'
import { resourceBuildings } from './progression/resource-buildings'

export type ObservedLevel = [name: string, level: unknown]

// Catalog metadata determines presentation only. Never fill in missing levels
// or filter historical observations against the current universe's availability.
export function groupReportBuildings(value: Record<string, unknown>) {
  const remaining = new Map(Object.entries(value))
  const take = (ids: readonly string[]): ObservedLevel[] =>
    ids.flatMap((id) => {
      if (!remaining.has(id)) return []
      const level = remaining.get(id)
      remaining.delete(id)
      return [[id, level] as ObservedLevel]
    })
  return [
    {
      title: 'Resource buildings',
      rows: take(
        resourceBuildings
          .filter((building) => building.id !== 'SolarSatellite')
          .map((building) => building.id),
      ),
    },
    { title: 'Facility buildings', rows: take(facilityIds) },
    {
      title: 'Other buildings',
      rows: [...remaining.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    },
  ].filter((group) => group.rows.length > 0)
}
