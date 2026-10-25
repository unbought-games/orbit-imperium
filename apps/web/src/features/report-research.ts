import type { components } from '../contracts'
import type { ObservedLevel } from './report-buildings'

// Report priorities differ from the research catalog: intelligence needed to
// assess a target comes first. These IDs describe presentation, not availability.
const researchGroups = [
  {
    title: 'Combat and espionage',
    ids: [
      'WeaponsTechnology',
      'ShieldingTechnology',
      'ArmourTechnology',
      'EspionageTechnology',
    ],
  },
  {
    title: 'Drive research',
    ids: ['CombustionDrive', 'ImpulseDrive', 'HyperspaceDrive'],
  },
  {
    title: 'Basic research',
    ids: [
      'EnergyTechnology',
      'LaserTechnology',
      'IonTechnology',
      'HyperspaceTechnology',
      'PlasmaTechnology',
    ],
  },
  {
    title: 'Advanced research',
    ids: [
      'ComputerTechnology',
      'Astrophysics',
      'IntergalacticResearchNetwork',
      'GravitonTechnology',
    ],
  },
] as const satisfies readonly {
  title: string
  ids: readonly components['schemas']['ResearchId3'][]
}[]

export function groupReportResearch(value: Record<string, unknown>) {
  const remaining = new Map(Object.entries(value))
  const groups = researchGroups.map(({ title, ids }) => ({
    title,
    rows: ids.flatMap((id): ObservedLevel[] => {
      if (!remaining.has(id)) return []
      const level = remaining.get(id)
      remaining.delete(id)
      return [[id, level]]
    }),
  }))
  return [
    ...groups,
    {
      title: 'Other research',
      rows: [...remaining.entries()].sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    },
  ].filter((group) => group.rows.length > 0)
}
