import { facilityIds } from './progression/catalog-content'

export type ObservedLevel = [name: string, level: unknown]
export type ObservedLevelGroup = { title: string; rows: ObservedLevel[][] }

const moonBuildings = ['LunarBase', 'SensorPhalanx', 'JumpGate'] as const

// Use the observed body kind, never the current world's availability. Historical
// payloads can contain generic zero-level entries for inapplicable buildings.
export function groupReportBuildings(
  value: Record<string, unknown>,
  bodyKind?: unknown,
): ObservedLevelGroup[] {
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
  const groups = [
    {
      title: 'Resource buildings',
      rows: [
        take(['MetalMine', 'CrystalMine', 'DeuteriumSynthesizer']),
        take(['SolarPlant', 'FusionReactor']),
        take(['MetalStorage', 'CrystalStorage', 'DeuteriumTank']),
      ],
    },
    {
      title: 'Facility buildings',
      rows: [
        take(['RoboticsFactory', 'NaniteFactory']),
        take(['Shipyard', 'ResearchLab']),
        take(facilityIds),
      ],
    },
    {
      title: 'Other buildings',
      rows: [
        [...remaining.entries()].sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        ),
      ],
    },
  ]
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => row.length > 0),
    }))
    .filter((group) => group.rows.length > 0)
}
