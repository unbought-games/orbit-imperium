import { useProfileSource } from '../shell/player-profiles-context'
import { Link } from '../ui/link'
import { Button, ButtonLink } from '../ui/button'
import { ArrowLeft } from 'lucide-react'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { ReportListRow } from './report-list-row'
import { TaskHeader } from '../ui/task-header'
import styles from './reports.module.css'
import { useEffect, useRef, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { ReportObservation } from './report-observation'
import { reportFailure } from './report-failure'
import { ReportVisibilityButton } from './report-visibility-button'
import { pendingReportVisibility } from './report-visibility'
import type { DispatchDraft } from './missions'
import { label } from '../ui/format'
import { useStore } from 'zustand'
import { currentServerTime } from '../client-model/game-projection'
import { Popover } from '../ui/popover'
import { reportAge } from './report-preview'
import { exactTime } from './mission-presentation'
type S = components['schemas']
export function Reports({
  model,
  universe,
  origin,
  item,
  onDraft,
}: {
  model: Coordinator
  universe: string
  origin: string
  item: string | null
  onDraft: (draft: DispatchDraft) => void
}) {
  const now = useStore(model.store, currentServerTime)
  const changingVisibility = useStore(
    model.store,
    (state) => !!pendingReportVisibility(state.attempts.values()),
  )
  const [page, setPage] = useState<S['ReportsPage4'] | null>(null),
    [detail, setDetail] = useState<S['ReportDetail4'] | null>(null),
    [error, setError] = useState<unknown>(null),
    [refresh, setRefresh] = useState(0),
    [olderPages, setOlderPages] = useState(false),
    [loading, setLoading] = useState(false),
    [loadingMore, setLoadingMore] = useState(false)
  useProfileSource(
    detail && detail.header.id === item
      ? { type: 'Report', report: detail.header.id }
      : null,
    model.view?.viewer_revision,
  )
  // One read gesture per opened report; server refreshes must not resubmit it.
  const readRequested = useRef<string | null>(null)
  useEffect(() => {
    readRequested.current = null
  }, [model, item])
  const failure = reportFailure(error)
  useEffect(() => {
    if (!item) setDetail(null)
    if (!item && page && olderPages) return
    let live = true
    setLoading(true)
    setError(null)
    if (detail?.header.id !== item) setDetail(null)
    const load = item ? model.reportDetail(item) : model.reportPage(null, false)
    void load
      .then((v) => {
        if (!live) return
        setLoading(false)
        if (!v) {
          setError('Unable to confirm this report response. Try again.')
          return
        }
        if ('header' in v) {
          setDetail(v)
          if (
            v.header.id === item &&
            !v.header.read &&
            readRequested.current !== item
          ) {
            readRequested.current = item
            setOlderPages(false)
            void model.send({
              type: 'World',
              action: { type: 'MarkReportRead', report: v.header.id },
            })
          }
          setPage((old) =>
            old
              ? {
                  ...old,
                  items: old.items
                    .map((row) => (row.id === v.header.id ? v.header : row))
                    .filter((row) => !row.hidden),
                }
              : old,
          )
        } else {
          setPage(v)
        }
      })
      .catch((error: unknown) => {
        if (live) {
          setLoading(false)
          setError(error)
        }
      })
    return () => {
      live = false
      // A cancelled detail request cannot leave a retained paginated inbox busy.
      setLoading(false)
    }
  }, [model, item, model.view?.viewer_revision, refresh])
  async function more() {
    setError(null)
    setOlderPages(true)
    setLoadingMore(true)
    try {
      const next = await model.reportPage(page?.next_cursor ?? null, false)
      if (next)
        setPage((old) => ({
          ...next,
          items: [...(old?.items ?? []), ...next.items],
        }))
    } catch (error) {
      setError(error)
    } finally {
      setLoadingMore(false)
    }
  }
  const combat = detail?.payload.kind === 'Combat' ? detail.payload : null
  const harvestAction =
    combat &&
    (BigInt(combat.debris.metal) > 0n || BigInt(combat.debris.crystal) > 0n) ? (
      <Button
        onClick={() =>
          onDraft({
            coordinates: combat.target,
            mission: 'Harvest',
            observedAt: detail!.header.observed_at,
          })
        }
      >
        Prepare harvest
      </Button>
    ) : null
  return (
    <Section className={styles.screen}>
      {!item && <TaskHeader title="Reports" />}
      {item && !detail && (
        <ButtonLink
          variant="secondary"
          size="icon-small"
          aria-label="Back to reports"
          title="Back to reports"
          onClick={() => void model.recordPresence('AccountVisit', null)}
          {...routeTarget(universe, 'reports', origin)}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </ButtonLink>
      )}
      {error !== null && (
        <>
          <Text tone="danger" role="alert">
            {failure.message}
          </Text>
          <Button
            onClick={() => {
              if (failure.reload) {
                window.location.reload()
                return
              }
              setOlderPages(false)
              setRefresh((n) => n + 1)
            }}
          >
            {failure.reload ? 'Reload app' : 'Retry reports'}
          </Button>
        </>
      )}
      {detail ? (
        <>
          <div className={styles.detailToolbar}>
            <ButtonLink
              variant="secondary"
              size="icon-small"
              aria-label="Back to reports"
              title="Back to reports"
              onClick={() => void model.recordPresence('AccountVisit', null)}
              {...routeTarget(universe, 'reports', origin)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </ButtonLink>
            <Popover
              label="Report time"
              className={styles.timestamp}
              trigger={reportAge(detail.header.observed_at, now)}
            >
              <time
                dateTime={new Date(detail.header.observed_at).toISOString()}
              >
                {exactTime(detail.header.observed_at)}
              </time>
            </Popover>
            <div className={styles.controls}>
              <ReportVisibilityButton
                model={model}
                report={detail.header.id}
                hidden={detail.header.hidden}
                compact
                disabled={loading}
                onRequest={() => setOlderPages(false)}
              />
              {detail.payload.kind === 'Espionage' &&
                model.view?.capabilities.some(
                  (c) => c.capability === 'Attack' && c.enabled,
                ) && (
                  <Button
                    onClick={() => {
                      if (detail.payload.kind === 'Espionage')
                        onDraft({
                          coordinates: detail.payload.target.coordinates,
                          mission: 'Attack',
                          target: {
                            type: 'Body',
                            id: detail.payload.target.body,
                            expected_owner: detail.payload.target.owner,
                            expected_kind: detail.payload.target.kind,
                          },
                          observedAt: detail.header.observed_at,
                        })
                    }}
                  >
                    Prepare attack
                  </Button>
                )}
              {harvestAction && (
                <div className={styles.desktopHarvest}>{harvestAction}</div>
              )}
            </div>
          </div>
          {detail.payload.kind !== 'Combat' &&
            detail.payload.kind !== 'ContactLost' && (
              <TaskHeader title={label(detail.header.kind)} />
            )}
          <ReportObservation
            payload={detail.payload}
            viewer={model.binding?.player}
            playerNames={detail.player_names}
            combatActions={
              harvestAction && (
                <div className={styles.mobileHarvest}>{harvestAction}</div>
              )
            }
          />

          {detail.payload.kind === 'Colonized' && (
            <div className={styles.controls}>
              <Link
                {...routeTarget(universe, 'resources', detail.payload.body)}
              >
                Open colony resources
              </Link>
              <Button
                onClick={() => {
                  if (detail.payload.kind === 'Colonized')
                    onDraft({
                      origin: detail.payload.origin,
                      coordinates: detail.payload.destination_coordinates,
                      mission: 'Transport',
                      target: {
                        type: 'Body',
                        id: detail.payload.body,
                        expected_kind: 'Planet',
                        expected_owner: model.binding!.player,
                      },
                    })
                }}
              >
                Prepare transport to colony
              </Button>
              <Button
                onClick={() => {
                  if (detail.payload.kind === 'Colonized')
                    onDraft({
                      origin: detail.payload.origin,
                      coordinates: detail.payload.destination_coordinates,
                      mission: 'Deploy',
                      target: {
                        type: 'Body',
                        id: detail.payload.body,
                        expected_kind: 'Planet',
                        expected_owner: model.binding!.player,
                      },
                    })
                }}
              >
                Prepare deployment to colony
              </Button>
            </div>
          )}
        </>
      ) : item ? (
        <Text role="status">
          {loading ? 'Fetching this report…' : 'This report is unavailable.'}
        </Text>
      ) : page ? (
        <>
          {!page.items.length && <Text>No reports yet.</Text>}
          {page.items.map((r) => (
            <ReportListRow
              key={r.id}
              report={r}
              model={model}
              universe={universe}
              origin={origin}
              now={now}
              disabled={loading || loadingMore || changingVisibility}
              onRequest={() => setOlderPages(false)}
            />
          ))}
          {page.has_more && (
            <Button
              disabled={loading || loadingMore || changingVisibility}
              onClick={() => void more()}
            >
              Load more reports
            </Button>
          )}
        </>
      ) : (
        <Text>Loading report history…</Text>
      )}
    </Section>
  )
}
