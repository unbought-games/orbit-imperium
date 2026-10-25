import type { components } from '../../contracts'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { ResourceValue } from '../../ui/resource-value'
import { DetailRow, DetailSection } from './detail-layout'
import { formatCombatStat } from './ship-statistics-format'
import styles from './detail-layout.module.css'

type Entry = components['schemas']['CatalogEntry3']

export function ShipStatistics({ entry }: { entry: Entry }) {
  if (entry.key.kind !== 'Ship') return null
  const stats = entry.ship_statistics
  const propulsion = stats?.propulsion
  const combat = stats?.combat
  const upgrade = propulsion?.impulse_upgrade
  return (
    <DetailSection title="Ship technical statistics">
      <p className={styles.note}>
        Base values per ship, before research bonuses. Actual flight time and
        mission fuel depend on the fleet, route and speed setting.
      </p>
      {!propulsion && !combat ? (
        <p className={styles.note}>
          Technical statistics are unavailable from this universe’s server.
        </p>
      ) : (
        <>
          <dl className={styles.compare}>
            {propulsion && (
              <>
                <DetailRow label="Cargo capacity">
                  <NumberValue value={propulsion.cargo_capacity} />
                </DetailRow>
                <DetailRow label="Base speed">
                  <NumberValue value={propulsion.base_speed} />
                </DetailRow>
                <DetailRow label="Drive">{label(propulsion.drive)}</DetailRow>
                <DetailRow label="Base fuel consumption">
                  <ResourceValue resource="deuterium">
                    <NumberValue value={propulsion.fuel_consumption} />
                  </ResourceValue>
                </DetailRow>
              </>
            )}
            {combat && (
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
                      ? combat[`rapid_fire_${direction}`].map(
                          (target, index) => (
                            <span key={`${target.unit.kind}:${target.unit.id}`}>
                              {index > 0 && '; '}
                              {label(target.unit.id)} ×{' '}
                              <NumberValue value={target.factor} />
                            </span>
                          ),
                        )
                      : 'None'}
                  </DetailRow>
                ))}
              </>
            )}
          </dl>
          {propulsion ? (
            <p className={styles.note}>
              Cargo capacity is shared by resources and mission fuel.
            </p>
          ) : (
            <p className={styles.note}>
              Propulsion statistics are unavailable.
            </p>
          )}
          {!combat && (
            <p className={styles.note}>Combat statistics are unavailable.</p>
          )}
          {upgrade && (
            <p className={styles.note}>
              At Impulse Drive level {upgrade.minimum_level}, the propulsion
              profile changes to base speed{' '}
              <NumberValue value={upgrade.base_speed} /> and base fuel
              consumption{' '}
              <ResourceValue resource="deuterium">
                <NumberValue value={upgrade.fuel_consumption} />
              </ResourceValue>
              , before drive research bonuses.
            </p>
          )}
        </>
      )}
    </DetailSection>
  )
}
