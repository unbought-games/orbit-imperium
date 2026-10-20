import type { BoundProgressionOptions } from '../../client-model/commands'
import { label } from '../../ui/format'
import { exactResource as units } from '../../ui/resource-cost-values'
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
              {b.required !== null
                ? ` — requires ${b.unit === 'MicroResource' ? units(b.required) : b.required}${b.resource ? ' ' + b.resource.toLowerCase() : ''}; current ${b.unit === 'MicroResource' ? units(b.actual ?? '0') : b.actual}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
    )
  )
}
