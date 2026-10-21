import type { BoundProgressionOptions } from '../../client-model/commands'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { AlertTriangle } from 'lucide-react'
import styles from './quote-review.module.css'

export function ProgressionBlockers({
  proposal,
}: {
  proposal: Pick<BoundProgressionOptions, 'blockers'>
}) {
  return (
    proposal.blockers.length > 0 && (
      <ul aria-label="Action blockers" className={styles.blockers}>
        {proposal.blockers.map((b, i) => (
          <li key={i}>
            <AlertTriangle size={19} aria-hidden="true" />
            <span>
              {label(b.code)}
              {b.requirement
                ? `: ${label(b.requirement.type === 'BodyBuilding' ? b.requirement.building : b.requirement.research)}`
                : ''}
              {b.required !== null && (
                <>
                  {' '}
                  — requires{' '}
                  <NumberValue
                    value={b.required}
                    divisor={b.unit === 'MicroResource' ? 1000000 : 1}
                  />
                  {b.resource ? ' ' + b.resource.toLowerCase() : ''}; current{' '}
                  {b.actual !== null ? (
                    <NumberValue
                      value={b.actual}
                      divisor={b.unit === 'MicroResource' ? 1000000 : 1}
                    />
                  ) : (
                    'Unknown'
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
    )
  )
}
