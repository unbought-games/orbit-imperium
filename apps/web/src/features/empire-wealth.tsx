import { Globe2, Rocket, Hourglass } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { BoundView } from '../client-model/commands'
import type { components } from '../contracts'
import { resourceNames } from '../client-model/resources'
import { ResourceNumber } from '../ui/number-value'
import { ResourceMark } from '../ui/resource-mark'
import { label } from '../ui/format'
import { empireTotals } from './empire-model'
import { useResourceColumns } from './use-resource-columns'
import styles from './empire-overview.module.css'

export function EmpireWealth({
  view,
  pendingCargo = [],
}: {
  view: BoundView
  pendingCargo?: components['schemas']['Resources'][]
}) {
  const columns = useResourceColumns<HTMLDivElement>()
  const totals = empireTotals(view, pendingCargo)
  return (
    <div className={styles.empireLedger} aria-label="Empire resource totals">
      <div className={styles.ledgerLabel}>
        <Globe2 size={17} />
        <span>
          Empire wealth<small>Worlds & owned fleet cargo</small>
        </span>
      </div>
      <div ref={columns} className={styles.wealthResources}>
        {resourceNames.map((name) => (
          <div
            className={styles.total}
            key={name}
            role="group"
            aria-label={`${label(name)} wealth`}
          >
            <div>
              <span className={styles.resourceName}>{label(name)}</span>
              <div className={styles.wealthAmount}>
                <ResourceMark resource={name} width={16} height={16} />
                <strong>
                  <ResourceNumber value={totals.total[name]} />
                </strong>
              </div>
            </div>
            <dl
              className={styles.wealthBreakdown}
              style={
                {
                  '--wealth-guide-color': `var(--resource-${name})`,
                } as CSSProperties
              }
            >
              <div title="On planets and moons">
                <dt>
                  <Globe2 size={14} aria-hidden="true" />
                  Worlds
                </dt>
                <dd>
                  <ResourceNumber value={totals.onWorlds[name]} />
                </dd>
              </div>
              <div title="On active fleets">
                <dt>
                  <Rocket size={14} aria-hidden="true" />
                  In flight
                </dt>
                <dd>
                  <ResourceNumber value={totals.inTransit[name]} />
                </dd>
              </div>
              {pendingCargo.length > 0 && (
                <div title="Launching">
                  <dt>
                    <Hourglass size={14} aria-hidden="true" />
                    Launching
                  </dt>
                  <dd>
                    <ResourceNumber value={totals.launching[name]} />
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
