import type { components } from '../../contracts'
import { CatalogItemLink } from '../../ui/catalog-item-link'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { ResourceValue } from '../../ui/resource-value'
import { Requirements } from '../../ui/requirements'
import { DetailRow } from './detail-layout'
import { ShipStatistics } from './ship-statistics'
import { CombatStatistics } from './combat-statistics'
import {
  bonusPercent,
  storageResource,
  technicalUnlocks,
} from './technical-data-model'
import type { ProgressionProps } from './shared'
import styles from './detail-layout.module.css'

type Entry = components['schemas']['CatalogEntry3']
export function TechnicalData({
  entry,
  view,
  body,
}: Pick<ProgressionProps, 'view' | 'body'> & { entry: Entry }) {
  const data = entry.technical_data
  const level =
    entry.key.kind === 'Building'
      ? body.levels[entry.key.id as keyof typeof body.levels]
      : view.research.find((r) => r.research === entry.key.id)?.level
  const unlocks = technicalUnlocks(entry, view.catalog, body.kind)
  const resource = storageResource(entry)
  return (
    <details className={styles.technical}>
      <summary>Technical data</summary>
      {!entry.enabled ? (
        <p className={styles.note}>
          Unavailable in this universe. Technical data is not provided for
          disabled content.
        </p>
      ) : (
        <>
          <p className={styles.note}>
            From this universe’s active rules. Completed levels apply; queued
            levels do not.
          </p>
          {entry.key.kind === 'Ship' ? (
            <ShipStatistics entry={entry} />
          ) : !data ? (
            <p className={styles.note}>
              Technical data is unavailable from this universe’s server.
            </p>
          ) : (
            <>
              {entry.key.kind === 'Defense' && (
                <>
                  <p className={styles.note}>
                    Base values per defense, before research bonuses.
                  </p>
                  {data.combat ? (
                    <dl className={styles.compare}>
                      <CombatStatistics combat={data.combat} />
                    </dl>
                  ) : (
                    <p className={styles.note}>
                      Combat statistics are unavailable.
                    </p>
                  )}
                </>
              )}
              <dl className={styles.compare}>
                {data.bonuses.map((bonus, index) => (
                  <DetailRow
                    key={index}
                    label={`${bonus.label} per completed level`}
                    hint={bonus.condition}
                  >
                    {bonus.subject && <>{label(bonus.subject.id)}: </>}+
                    {bonusPercent(bonus.fraction)} of base
                    {!bonus.subject && level !== undefined && (
                      <>
                        {' '}
                        · Level {level}: +{bonusPercent(bonus.fraction, level)}{' '}
                        of base
                      </>
                    )}
                  </DetailRow>
                ))}
                {data.facts.map((fact, index) => (
                  <DetailRow key={index} label={fact.label}>
                    {fact.subject && <>{label(fact.subject.id)}: </>}
                    {fact.value}
                  </DetailRow>
                ))}
                {resource && level === undefined && (
                  <DetailRow label="Storage capacity">
                    Current level unavailable.
                  </DetailRow>
                )}
                {resource &&
                  level !== undefined &&
                  [level, level + 1].map((at, index) => (
                    <DetailRow
                      key={at}
                      label={`${index ? 'Next' : 'Current'} capacity · level ${at}`}
                    >
                      {data.storage_capacities?.[at] !== undefined ? (
                        <ResourceValue resource={resource}>
                          <NumberValue value={data.storage_capacities[at]} />
                        </ResourceValue>
                      ) : (
                        'Unavailable for this level'
                      )}
                    </DetailRow>
                  ))}
              </dl>
            </>
          )}
          <h3>Prerequisites</h3>
          {entry.requirements.length ? (
            <Requirements
              requirements={entry.requirements}
              view={view}
              body={body}
            />
          ) : (
            <p className={styles.note}>No prerequisites.</p>
          )}
          {(entry.key.kind === 'Building' || entry.key.kind === 'Research') && (
            <>
              <h3>Required for</h3>
              {unlocks.length ? (
                <>
                  <p className={styles.note}>
                    These levels satisfy one prerequisite. Other requirements
                    may still apply.
                  </p>
                  <dl className={styles.compare}>
                    {unlocks.map(({ entry: target, level: required }) => (
                      <DetailRow
                        key={`${target.key.kind}:${target.key.id}`}
                        label={`Level ${required}${level !== undefined && level >= required ? ' · met' : ''}`}
                      >
                        <CatalogItemLink
                          item={target.key}
                          body={body.id}
                          className={styles.inlineLink}
                        />
                      </DetailRow>
                    ))}
                  </dl>
                </>
              ) : (
                <p className={styles.note}>
                  No enabled catalog entries on this body require this
                  technology.
                </p>
              )}
            </>
          )}
        </>
      )}
    </details>
  )
}
