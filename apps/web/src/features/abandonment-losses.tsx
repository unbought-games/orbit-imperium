import type { components } from '../contracts'
import { ResourceQuantity, NumberValue } from '../ui/number-value'
import { label, coordinates } from '../ui/format'
import { resourceNames } from '../client-model/resources'
import styles from './planet-actions.module.css'

export function AbandonmentLosses({
  losses,
}: {
  losses: components['schemas']['AbandonmentLoss4'][]
}) {
  return (
    <div className={styles.losses}>
      {losses.map((loss) => (
        <section key={loss.id} aria-label={`${loss.kind} losses`}>
          <h3>
            {loss.name ?? loss.kind} {coordinates(loss)}
            {loss.kind === 'Moon' ? ' · Moon' : ''}
          </h3>
          <div className={styles.resources}>
            {resourceNames.map((resource) => (
              <ResourceQuantity
                key={resource}
                resource={resource}
                value={loss.resources[resource]}
              />
            ))}
          </div>
          <details>
            <summary>Buildings and stationed units</summary>
            <dl className={styles.inventory}>
              {Object.entries(loss.buildings)
                .filter(([, level]) => level > 0)
                .map(([item, level]) => (
                  <div key={item}>
                    <dt>{label(item)}</dt>
                    <dd>Level {level}</dd>
                  </div>
                ))}
              {loss.inventory.map((x) => (
                <div key={x.item.id}>
                  <dt>{label(x.item.id)}</dt>
                  <dd>
                    <NumberValue value={x.count} />
                  </dd>
                </div>
              ))}
            </dl>
            {!loss.inventory.length &&
              !Object.values(loss.buildings).some((n) => n > 0) && <p>None</p>}
          </details>
          {[...loss.construction, ...loss.manufacturing].length > 0 && (
            <details open>
              <summary>Unfinished work lost without refund</summary>
              <ul>
                {[...loss.construction, ...loss.manufacturing].map((work) => (
                  <li key={work.id}>
                    <NumberValue value={work.quantity} /> × {label(work.item)}
                    <div className={styles.resources}>
                      {resourceNames.map((resource) => (
                        <ResourceQuantity
                          key={resource}
                          resource={resource}
                          value={work.paid[resource]}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  )
}
