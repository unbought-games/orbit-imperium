import { facilityIds } from './progression/catalog-content'

export type ObservedLevel = [name: string, level: unknown]
export type ObservedLevelRow = { title: string; levels: ObservedLevel[] }

const moonBuildings = ['LunarBase', 'SensorPhalanx', 'JumpGate'] as const

// Use the observed body kind, never the current world's availability. Historical
// payloads can contain generic zero-level entries for inapplicable buildings.
export function groupReportBuildings(
  value: Record<string, unknown>,
  bodyKind?: unknown,
): ObservedLevelRow[] {
  const remaining = new Map(Object.entries(value))
  if (bodyKind === 'Planet')
    for (const id of moonBuildings) remaining.delete(id)
  const take = (ids: readonly string[]): ObservedLevel[] =>
    ids.flatMap((id) => {
      if (!remaining.has(id)) return []
      const level = remaining.get(id)
      remaining.delete(id)
      return [[id, level] as ObservedLevel]
    })
  const rows = [
    {
      title: 'Mines',
      levels: take(['MetalMine', 'CrystalMine', 'DeuteriumSynthesizer']),
    },
    { title: 'Power', levels: take(['SolarPlant', 'FusionReactor']) },
    {
      title: 'Storage',
      levels: take(['MetalStorage', 'CrystalStorage', 'DeuteriumTank']),
    },
    { title: 'Production', levels: take(['RoboticsFactory', 'NaniteFactory']) },
    { title: 'Infrastructure', levels: take(['Shipyard', 'ResearchLab']) },
    { title: 'Facilities', levels: take(facilityIds) },
    {
      title: 'Other buildings',
      levels: [...remaining.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    },
  ]
  return rows.filter(({ levels }) => levels.length > 0)
}
