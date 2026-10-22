import { useUniverseName } from '../shell/session-context'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { label } from '../ui/format'
import { Heading } from '../ui/typography'
import { Link } from '../ui/link'
import { Hammer, FlaskConical, Rocket, ArrowRight } from 'lucide-react'
import { useCountdown } from '../client-model/use-clock'
import styles from './work-summaries.module.css'
import { useContext } from 'react'
import { SessionContext } from '../shell/session-context'
import { pendingWork } from '../client-model/game-projection'
import { buildingProgress } from '../client-model/building-progress'
import { researchProgress } from '../client-model/research-progress'
import { elapsedProgress } from './overview-progress'
import { Button } from '../ui/button'
import {
  manufacturingQueue,
  formatQueueCountdown,
} from '../client-model/manufacturing-queue'
export function WorkSummaries({
  view,
  body,
  includeResearch = true,
  only,
  layout = 'editorial',
}: {
  view: BoundView
  body: BoundView['bodies'][number]
  includeResearch?: boolean
  only?: 'buildings' | 'research' | 'manufacturing'
  layout?: 'cards' | 'editorial' | 'compact'
}) {
  const universeName = useUniverseName()
  const countdown = useCountdown(
    view.sampled_at,
    layout !== 'cards' ? 'compact' : 'exact',
  )
  const session = useContext(SessionContext)
  const state = session?.model.store.getState()
  // Keep the operation visible until cancellation is confirmed, like its control.
  const workView = state?.view ?? view
  const buildingWork = state ? buildingProgress(state, body.id) : null
  const researchWork = state ? researchProgress(state) : null
  const pending = session
    ? pendingWork(session.model.store.getState(), body.id)
    : null
  const construction =
    workView.constructions.find((x) => x.body === body.id) ??
    pending?.construction
  const confirmedResearch =
    workView.protocol !== 2 ? workView.progression.research_operation : null
  const research =
    confirmedResearch ??
    (pending?.research?.terms.type === 'Research'
      ? {
          ...pending.research.terms,
          due_at:
            pending.research.submittedAt + pending.research.terms.duration_ms,
        }
      : null)
  const queue = manufacturingQueue(view, body.id, pending?.manufacturing)
  const now = state
    ? view.sampled_at + Math.max(0, state.now - state.receivedAt)
    : view.sampled_at
  const researchPercent = confirmedResearch
    ? elapsedProgress(
        confirmedResearch.started_at,
        confirmedResearch.due_at,
        now,
      )
    : null
  const researchHost = research
    ? view.bodies.find((entry) => entry.id === research.host)
    : null
  const manufacturePercent = (id: string) => {
    const batch =
      view.protocol !== 2
        ? view.progression.manufacturing.find((entry) => entry.id === id)
        : null
    return batch?.state === 'Producing'
      ? elapsedProgress(
          batch.next_due_at - batch.unit_duration_ms,
          batch.next_due_at,
          now,
        )
      : null
  }

  const summaries = [
    {
      category: 'buildings',
      title: 'Buildings',
      page:
        construction &&
        ['RoboticsFactory', 'ResearchLab', 'Shipyard'].includes(
          construction.building,
        )
          ? 'facilities'
          : 'resources',
      icon: Hammer,
      name: construction
        ? `${label(construction.building)} · Level ${construction.target_level}`
        : 'No construction in progress.',
      due: construction?.due_at,
      work: buildingWork,
      cancelType: 'CancelConstruction' as const,
    },
    {
      category: 'research',
      title: 'Research',
      page: 'research',
      icon: FlaskConical,
      name: research
        ? `${label(research.research)} · Level ${research.target_level}`
        : 'No research in progress.',
      due: research?.due_at,
      work: researchWork,
      cancelType: 'CancelResearch' as const,
    },
    {
      category: 'manufacturing',
      title: 'Shipyard & defense',
      page: 'shipyard',
      icon: Rocket,
      name: 'No ships or defenses in production.',
    },
  ]
  return (
    <div
      className={`${styles.summaries} ${layout !== 'cards' ? styles.editorial : ''} ${layout === 'compact' ? styles.compact : ''}`}
    >
      {summaries
        .filter(
          (x) =>
            (!only || x.category === only) &&
            (includeResearch || x.page !== 'research'),
        )
        .map(
          ({
            category,
            title,
            page,
            icon: Icon,
            name,
            due,
            work,
            cancelType,
          }) => {
            const enabled = resolveDestination(
              {
                universe: view.binding.universe,
                page: page as Page,
                body: body.id,
              },
              view,
            ).available
            return (
              <section
                className={styles.summary}
                key={title}
                aria-label={title}
              >
                <Heading level={2}>{title}</Heading>
                {category === 'manufacturing' && queue.length > 0 ? (
                  <ol className={styles.queue} aria-label="Manufacturing queue">
                    {queue.map((batch) => (
                      <li key={batch.id}>
                        <span>
                          {label(batch.item.id)} · {batch.remaining} remaining
                        </span>
                        <strong>{batch.status}</strong>
                        {layout !== 'cards' &&
                          manufacturePercent(batch.id) !== null && (
                            <progress
                              aria-label={`${label(batch.item.id)} next unit estimated progress`}
                              value={manufacturePercent(batch.id)!}
                              max={100}
                            />
                          )}
                        {batch.due !== undefined && (
                          <span>
                            {formatQueueCountdown(
                              batch.status,
                              countdown(batch.due),
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className={styles['summary-content']}>
                    <Icon aria-hidden="true" size={26} />
                    <p>
                      {name}
                      {layout !== 'cards' && work && (
                        <small className={styles.workStatus}>
                          {work.status}
                          {category === 'research' && researchHost
                            ? ` · Host ${researchHost.kind} [${researchHost.coordinates.galaxy}:${researchHost.coordinates.system}:${researchHost.coordinates.position}]`
                            : ''}
                        </small>
                      )}
                      {layout !== 'cards' &&
                        category === 'research' &&
                        researchPercent !== null && (
                          <progress
                            aria-label="Research estimated progress"
                            value={researchPercent}
                            max={100}
                          />
                        )}
                      {due !== undefined && (
                        <>
                          <strong>{countdown(due)}</strong>
                          {layout !== 'cards' && (
                            <time dateTime={new Date(due).toISOString()}>
                              {new Date(due).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'long',
                              })}
                            </time>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                )}
                <div className={styles.actions}>
                  {work && session && cancelType && (
                    <Button
                      variant="quiet"
                      aria-label={
                        cancelType === 'CancelConstruction'
                          ? 'Cancel construction'
                          : 'Cancel research'
                      }
                      disabled={!work.canCancel}
                      onClick={() => {
                        if (work.canCancel && work.operationId)
                          void session.model.send({
                            type: cancelType,
                            operation: work.operationId,
                          })
                      }}
                    >
                      {work.status === 'Cancelling' ? 'Cancelling…' : 'Cancel'}
                    </Button>
                  )}
                  {enabled ? (
                    <Link {...routeTarget(universeName, page as Page, body.id)}>
                      Open{' '}
                      {category === 'manufacturing'
                        ? 'shipyard'
                        : title.toLowerCase()}{' '}
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className={styles.unavailable}>
                      Unavailable in this universe
                    </span>
                  )}
                  {category === 'manufacturing' &&
                    resolveDestination(
                      {
                        universe: view.binding.universe,
                        page: 'defense',
                        body: body.id,
                      },
                      view,
                    ).available && (
                      <Link {...routeTarget(universeName, 'defense', body.id)}>
                        Open defenses{' '}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    )}
                </div>
              </section>
            )
          },
        )}
    </div>
  )
}
