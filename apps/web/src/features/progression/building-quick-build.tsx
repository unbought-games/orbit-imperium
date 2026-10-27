import { useId, type ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import { VisuallyHidden } from '../../ui/visually-hidden'
import { Popover } from '../../ui/popover'
import { Hammer, Info } from 'lucide-react'
import type { components } from '../../contracts'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'
import { Button } from '../../ui/button'
import { ResourceCosts } from '../../ui/resource-costs'
import { DurationValue, ResourceQuantity } from '../../ui/number-value'
import { ProgressionBlockers } from './quote-review'
import { ProgressionActionFeedback } from './action-feedback'
import { useBuildingQuickBuild } from './use-building-quick-build'
import styles from './building-quick-build.module.css'

export function BuildingQuickBuild({
  model,
  view,
  body,
  request,
  tile,
  unavailable,
  cost,
}: {
  model: ProgressionProps['coordinator']
  view: ProgressionProps['view']
  body: ProgressionProps['body']
  request: Extract<ProgressionRequest, { type: 'Upgrade' }>
  tile: ComponentProps<typeof ImageTile>
  unavailable: string
  cost: components['schemas']['Resources'] | null
}) {
  const description = useId()
  const title = tile.title
  const { proposal, reason, error, retry, submit } = useBuildingQuickBuild({
    model,
    view,
    request,
    unavailable,
  })
  const terms = proposal?.terms?.type === 'Building' ? proposal.terms : null
  return (
    <div>
      <ImageTile
        {...tile}
        action={
          !tile.progress && (
            <div
              className={styles.action}
              role="group"
              aria-label={`${title} quick build`}
            >
              <Button
                type="button"
                size="small"
                className={styles.build}
                padding="compact"
                aria-label={
                  error
                    ? `Retry ${title} build details`
                    : `Build ${title}${terms ? ` level ${terms.target_level}` : ''}`
                }
                aria-describedby={description}
                title={reason || `Build ${title} level ${terms?.target_level}`}
                disabled={!!reason && !error}
                onClick={error ? retry : submit}
              >
                <Hammer size={16} aria-hidden="true" />{' '}
                {error ? 'Retry' : 'Build'}
              </Button>
              <VisuallyHidden id={description}>
                {reason || 'Build the next level on this planet.'}
              </VisuallyHidden>
              <Popover
                label={`${title} build`}
                className={styles.details}
                trigger={<Info size={18} aria-hidden="true" />}
              >
                <div className={styles.review}>
                  <strong>
                    {title}
                    {terms ? ` · Level ${terms.target_level}` : ''}
                  </strong>
                  <p>{reason || 'Build the next level on this planet.'}</p>
                  {(terms?.paid ?? cost) && (
                    <ResourceCosts
                      compact
                      cost={(terms?.paid ?? cost)!}
                      available={body.amounts}
                    />
                  )}
                  {terms && (
                    <p>
                      Build time:{' '}
                      <DurationValue milliseconds={terms.duration_ms} />
                    </p>
                  )}
                  {terms && BigInt(terms.required_energy) > 0n && (
                    <p>
                      Construction energy required:{' '}
                      <ResourceQuantity
                        resource="energy"
                        value={terms.required_energy}
                      />
                    </p>
                  )}
                  {proposal && (
                    <ProgressionBlockers
                      proposal={proposal}
                      view={view}
                      body={body}
                    />
                  )}
                </div>
              </Popover>
            </div>
          )
        }
      />
      <ProgressionActionFeedback
        model={model}
        body={body.id}
        item={{ kind: 'Building', id: request.building }}
      />
    </div>
  )
}
