import type { CombatForce } from './combat-report-model'

export function combatForceGroups(force: Pick<CombatForce, 'rows' | 'side'>) {
  if (force.side !== 'Defender') return [{ title: null, rows: force.rows }]
  return [
    { title: 'Ships', rows: force.rows.filter((row) => row.kind === 'Ship') },
    {
      title: 'Defenses',
      rows: force.rows.filter((row) => row.kind === 'Defense'),
    },
    {
      title: 'Other units',
      rows: force.rows.filter(
        (row) => row.kind !== 'Ship' && row.kind !== 'Defense',
      ),
    },
  ].filter((group) => group.rows.length)
}
