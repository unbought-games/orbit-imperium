import { debrisResourceKinds, resourceKinds } from './debris-resources'
import { ResourceMark } from '../ui/resource-mark'
import { ResourceNumber } from '../ui/number-value'
import { label } from '../ui/format'
import type { ReportFact } from './report-preview'
import styles from './reports.module.css'

/** Historical facts shared by report rows; no live game state is read here. */
export function ReportPreviewFacts({ facts }: { facts: ReportFact[] }) {
  return facts.length > 0 ? (
    <span className={styles.preview}>
      {facts.map((fact, index) => (
        <span className={styles.fact} key={index}>
          {index > 0 && <span aria-hidden="true">·</span>}
          {typeof fact === 'string' ? (
            fact
          ) : (
            <>
              {fact.label && <span>{fact.label}:</span>}
              {(fact.debris
                ? debrisResourceKinds(fact.resources.deuterium)
                : resourceKinds
              ).map((resource) => (
                <span
                  key={resource}
                  className={styles.resourceValue}
                  title={label(resource)}
                >
                  <ResourceMark
                    resource={resource}
                    width={16}
                    height={16}
                    aria-hidden={false}
                    role="img"
                    aria-label={label(resource)}
                  />
                  <ResourceNumber value={fact.resources[resource]} />
                </span>
              ))}
            </>
          )}
        </span>
      ))}
    </span>
  ) : null
}
