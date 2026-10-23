import { workSummaryTiming } from './work-summary-timing'
import { useUniverseName } from '../shell/session-context'
import type { BoundView } from '../client-model/commands'
import { routeTarget } from '../shell/route-target'
import { resolveDestination, type Page } from '../shell/routes'
import { bodyName, label } from '../ui/format'
import { Heading } from '../ui/typography'
import { Link } from '../ui/link'
import { Hammer, FlaskConical, Rocket, ArrowRight } from 'lucide-react'
import { useCountdown } from '../client-model/use-clock'
import styles from './work-summaries.module.css'
import { useContext } from 'react'
import { SessionContext } from '../shell/session-context'
import { pendingWork } from '../client-model/game-projection'
import { buildingProgress } from '../client-model/building-progress'
import { catalogPage } from '../shell/catalog-routes'
import { researchProgress } from '../client-model/research-progress'
import { elapsedProgress } from './overview-progress'
import { ConfirmationButton } from '../ui/confirmation-button'
import { ResourceSummary } from '../ui/number-value'
import {
  manufacturingQueue,
  formatQueueCountdown,
} from '../client-model/manufacturing-queue'
export function WorkSummaries({
  view,
  body,
  currentPage,
  includeResearch = true,
  only,
  layout = 'editorial',
}: {
  view: BoundView
  body: BoundView['bodies'][number]
  currentPage: Page
  includeResearch?: boolean
  only?: 'buildings' | 'research' | 'manufacturing'
  layout?: 'cards' | 'editorial' | 'compact'
}) {
  const universeName = useUniverseName()
  const countdown = useCountdown(
    view.sampled_at,
    layout !== 'cards' ? 'compact' : 'remaining',
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
            const showLink =
              page !== currentPage &&
              !(category === 'buildings' && currentPage === 'resources') &&
              !(
                category === 'buildings' &&
                !construction &&
                currentPage === 'facilities'
              )
            const enabled = resolveDestination(
              {
                universe: view.binding.universe,
                page: page as Page,
                body: body.id,
              },
              view,
            ).available
            const target =
              category === 'buildings' && construction
                ? routeTarget(
                    universeName,
                    catalogPage({
                      kind: 'Building',
                      id: construction.building,
                    }),
                    body.id,
                    construction.building,
                  )
                : category === 'research' && research
                  ? routeTarget(
                      universeName,
                      'research',
                      researchHost?.id ?? body.id,
                      research.research,
                    )
                  : null
            const compactWork =
              layout === 'compact' && target && work && due !== undefined
            const host =
              category === 'research' && researchHost
                ? `Host ${bodyName(researchHost)} [${researchHost.coordinates.galaxy}:${researchHost.coordinates.system}:${researchHost.coordinates.position}]`
                : null
            return (
              <section
                className={`${styles.summary} ${compactWork ? styles.activeSummary : ''}`}
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
                      {compactWork ? (
                        <Link
                          {...target}
                          className={styles.workLink}
                          title={host ?? undefined}
                          aria-description={host ?? undefined}
                        >
                          <span>{name}</span>{' '}
                          <span className={styles.workTiming}>
                            {workSummaryTiming(work.status, countdown(due))}
                          </span>
                        </Link>
                      ) : (
                        <>
                          {target ? <Link {...target}>{name}</Link> : name}
                          {layout !== 'cards' &&
                            work &&
                            (work.status !== 'In progress' || host) && (
                              <small className={styles.workStatus}>
                                {[
                                  work.status !== 'In progress'
                                    ? work.status
                                    : null,
                                  host,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
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
                        </>
                      )}
                    </p>
                  </div>
                )}
                <div className={styles.actions}>
                  {work && session && cancelType && (
                    <ConfirmationButton
                      key={work.operationId ?? 'pending'}
                      dialogTitle={
                        cancelType === 'CancelConstruction'
                          ? 'Cancel construction?'
                          : 'Cancel research?'
                      }
                      confirmLabel="Confirm cancellation"
                      cancelLabel="Keep working"
                      review={
                        <p>
                          Stop {name} and refund{' '}
                          <ResourceSummary value={work.paid} />?
                        </p>
                      }
                      variant="secondary"
                      aria-label={
                        cancelType === 'CancelConstruction'
                          ? 'Cancel construction'
                          : 'Cancel research'
                      }
                      disabled={!work.canCancel}
                      onConfirm={() => {
                        if (work.canCancel && work.operationId)
                          void session.model.send({
                            type: cancelType,
                            operation: work.operationId,
                          })
                      }}
                    >
                      {work.status === 'Cancelling' ? 'Cancelling…' : 'Cancel'}
                    </ConfirmationButton>
                  )}
                  {showLink &&
                    (enabled ? (
                      <Link
                        {...routeTarget(universeName, page as Page, body.id)}
                      >
                        Open{' '}
                        {category === 'manufacturing'
                          ? 'shipyard'
                          : category === 'buildings' &&
                              ['resources', 'facilities'].includes(currentPage)
                            ? page
                            : title.toLowerCase()}{' '}
                        <ArrowRight size={12} aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className={styles.unavailable}>
                        Unavailable in this universe
                      </span>
                    ))}
                  {category === 'manufacturing' &&
                    currentPage !== 'defense' &&
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
