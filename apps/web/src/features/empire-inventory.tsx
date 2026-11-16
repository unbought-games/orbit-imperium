import { Orbit, Shield } from 'lucide-react'
import type { BoundView } from '../client-model/commands'
import { EmptyState } from '../ui/empty-state'
import { label } from '../ui/format'
import styles from './empire-overview.module.css'
type Body = BoundView['bodies'][number]

export function StationedUnits({
  body,
  kind,
}: {
  body: Body
  kind: 'Ship' | 'Defense'
}) {
  const items = body.inventories.filter(
    (entry) => entry.item.kind === kind && BigInt(entry.count) > 0n,
  )
  const title = kind === 'Ship' ? 'Orbital fleet' : 'Planetary defenses'
  const Icon = kind === 'Ship' ? Orbit : Shield
  const total = items.reduce((sum, item) => sum + BigInt(item.count), 0n)
  const unit = kind === 'Ship' ? 'ship' : 'defense'
  return (
    <details className={styles.inventory}>
      <summary>
        <span>
          <Icon size={15} /> {title}
        </span>
        <span>
          {total.toLocaleString('en-US')} {unit}
          {total === 1n ? '' : 's'}
        </span>
      </summary>
      <section aria-label={title}>
        {items.length ? (
          <dl>
            {items.map((item) => (
              <div key={item.item.id}>
                <dt>{label(item.item.id)}</dt>
                <dd>{item.count}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState
            icon={Icon}
            variant="compact"
            headingLevel={3}
            title={
              kind === 'Ship'
                ? 'No ships stationed here.'
                : 'No defenses stationed here.'
            }
          />
        )}
      </section>
    </details>
  )
}
