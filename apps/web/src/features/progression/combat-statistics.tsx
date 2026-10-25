import type { components } from '../../contracts'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { DetailRow } from './detail-layout'
import { formatCombatStat } from './ship-statistics-format'

export function CombatStatistics({
  combat,
}: {
  combat: components['schemas']['ShipCombatStatistics3']
}) {
  return (
    <>
      <DetailRow label="Attack strength">
        {formatCombatStat(combat.attack_ticks)}
      </DetailRow>
      <DetailRow label="Shield strength">
        {formatCombatStat(combat.shield_ticks)}
      </DetailRow>
      <DetailRow label="Hull strength">
        {formatCombatStat(combat.hull_ticks)}
      </DetailRow>
      {(['against', 'from'] as const).map((direction) => (
        <DetailRow key={direction} label={`Rapid fire ${direction}`}>
          {combat[`rapid_fire_${direction}`].length
            ? combat[`rapid_fire_${direction}`].map((target, index) => (
                <span key={`${target.unit.kind}:${target.unit.id}`}>
                  {index > 0 && '; '}
                  {label(target.unit.id)} ×{' '}
                  <NumberValue value={target.factor} />
                </span>
              ))
            : 'None'}
        </DetailRow>
      ))}
    </>
  )
}
