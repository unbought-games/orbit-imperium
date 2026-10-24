import type { ReactNode } from 'react'
import { ResourceValue } from '../../ui/resource-value'
import { formatDuration } from '../../client-model/duration'
import type { BoundProgressionOptions } from '../../client-model/commands'
import { CatalogItemLink } from '../../ui/catalog-item-link'
import { label } from '../../ui/format'
import { ResourceShortfall } from '../../ui/number-value'
import { NumberValue } from '../../ui/number-value'
import { AlertTriangle } from 'lucide-react'
import styles from './quote-review.module.css'
import type { ProgressionProps } from './shared'
import { blockerExplanation } from './detail-insights'

function BlockerValue({
  blocker,
  children,
}: {
  blocker: BoundProgressionOptions['blockers'][number]
  children: ReactNode
}) {
  const resource =
    blocker.unit === 'MicroEnergy'
      ? 'energy'
      : blocker.resource === 'Metal'
        ? 'metal'
        : blocker.resource === 'Crystal'
          ? 'crystal'
          : blocker.resource === 'Deuterium'
            ? 'deuterium'
            : null
  return resource ? (
    <ResourceValue resource={resource}>{children}</ResourceValue>
  ) : (
    <>{children}</>
  )
}

export function ProgressionBlockers({
  proposal,
  view,
  body,
  now,
  resourceWait,
  resourcesInCosts = false,
}: {
  proposal: Pick<BoundProgressionOptions, 'blockers'>
  view?: ProgressionProps['view']
  body?: ProgressionProps['body']
  now?: number
  resourceWait?: number | null
  resourcesInCosts?: boolean
}) {
  const resources = proposal.blockers.filter(
    (blocker) => blocker.code === 'InsufficientResources',
  )
  const blockers =
    resourceWait === undefined && !resourcesInCosts
      ? proposal.blockers
      : proposal.blockers.filter(
          (blocker) => blocker.code !== 'InsufficientResources',
        )
  const showResources =
    !resourcesInCosts && resourceWait !== undefined && resources.length > 0
  return (
    (blockers.length > 0 || showResources) && (
      <ul aria-label="Action blockers" className={styles.blockers}>
        {showResources && (
          <li>
            <AlertTriangle size={19} aria-hidden="true" />
            <span>
              More{' '}
              {resources
                .map((blocker) => blocker.resource?.toLowerCase())
                .filter(Boolean)
                .join(' and ') || 'resources'}{' '}
              needed.
              <small style={{ display: 'block' }}>
                {resourceWait !== null && resourceWait !== undefined ? (
                  <>
                    Ready in ~{formatDuration(resourceWait)} at current
                    production, if nothing else is spent.
                  </>
                ) : (
                  'Add resources or improve production/storage; no production-only estimate is available.'
                )}
              </small>
            </span>
          </li>
        )}
        {blockers.map((b, i) => (
          <li key={i}>
            <AlertTriangle size={19} aria-hidden="true" />
            <span>
              {b.code === 'InsufficientResources' &&
              b.required !== null &&
              b.actual !== null &&
              b.unit === 'MicroResource' ? (
                <>
                  Need{' '}
                  <BlockerValue blocker={b}>
                    <ResourceShortfall
                      value={(BigInt(b.required) - BigInt(b.actual)).toString()}
                    />
                  </BlockerValue>{' '}
                  more {b.resource?.toLowerCase()}
                </>
              ) : (
                label(b.code)
              )}
              {b.requirement && (
                <>
                  :{' '}
                  {body ? (
                    <CatalogItemLink
                      className={styles.prerequisiteLink}
                      body={body.id}
                      item={
                        b.requirement.type === 'BodyBuilding'
                          ? { kind: 'Building', id: b.requirement.building }
                          : { kind: 'Research', id: b.requirement.research }
                      }
                    />
                  ) : (
                    label(
                      b.requirement.type === 'BodyBuilding'
                        ? b.requirement.building
                        : b.requirement.research,
                    )
                  )}
                </>
              )}
              {b.required !== null && b.code !== 'InsufficientResources' && (
                <>
                  {' '}
                  — requires{' '}
                  <BlockerValue blocker={b}>
                    <NumberValue
                      value={b.required}
                      divisor={
                        b.unit === 'MicroResource' || b.unit === 'MicroEnergy'
                          ? 1000000
                          : 1
                      }
                    />
                  </BlockerValue>
                  {b.resource ? ' ' + b.resource.toLowerCase() : ''}; current{' '}
                  {b.actual !== null ? (
                    <BlockerValue blocker={b}>
                      <NumberValue
                        value={b.actual}
                        divisor={
                          b.unit === 'MicroResource' || b.unit === 'MicroEnergy'
                            ? 1000000
                            : 1
                        }
                      />
                    </BlockerValue>
                  ) : (
                    'Unknown'
                  )}
                </>
              )}
              {view && body && (
                <small style={{ display: 'block' }}>
                  {blockerExplanation(b, view, body, now ?? view.sampled_at)}
                </small>
              )}
            </span>
          </li>
        ))}
      </ul>
    )
  )
}
