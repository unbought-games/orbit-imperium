import { useProfileSource } from '../shell/player-profiles-context'
import { Link } from '../ui/link'
import { Button } from '../ui/button'
import { Input } from '../ui/form'
import { Field } from '../ui/form'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Panel } from '../ui/panel'
import { TaskHeader } from '../ui/task-header'
import styles from './reports.module.css'
import { useEffect, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { ReportObservation } from './report-observation'
import { reportFailure } from './report-failure'
import type { DispatchDraft } from './missions'
import { label } from '../ui/format'
import { useStore } from 'zustand'
import { currentServerTime } from '../client-model/game-projection'
import { exactTime, observationAge } from './mission-presentation'
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
  const [page, setPage] = useState<S['ReportsPage4'] | null>(null),
    [detail, setDetail] = useState<S['ReportDetail4'] | null>(null),
    [error, setError] = useState<unknown>(null),
    [includeHidden, setIncludeHidden] = useState(false),
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
  const failure = reportFailure(error)
  useEffect(() => {
    if (!item) setDetail(null)
    if (!item && page && olderPages) return
    let live = true
    setLoading(true)
    setError(null)
    if (detail?.header.id !== item) setDetail(null)
    const load = item
      ? model.reportDetail(item)
      : model.reportPage(null, includeHidden)
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
          setPage((old) =>
            old
              ? {
                  ...old,
                  items: old.items
                    .map((row) => (row.id === v.header.id ? v.header : row))
                    .filter((row) => includeHidden || !row.hidden),
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
  }, [model, item, model.view?.viewer_revision, includeHidden, refresh])
  async function more() {
    setError(null)
    setOlderPages(true)
    setLoadingMore(true)
    try {
      const next = await model.reportPage(
        page?.next_cursor ?? null,
        includeHidden,
      )
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
  return (
    <Section className={styles.screen}>
      {!item && <TaskHeader title="Reports" />}
      {item && !detail && (
        <Link
          onClick={() => void model.recordPresence('AccountVisit', null)}
          {...routeTarget(universe, 'reports', origin)}
        >
          Back to reports
        </Link>
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
            <Link
              onClick={() => void model.recordPresence('AccountVisit', null)}
              {...routeTarget(universe, 'reports', origin)}
            >
              Back to reports
            </Link>
            <Text className={styles.timestamp}>
              <time
                dateTime={new Date(detail.header.observed_at).toISOString()}
              >
                {exactTime(detail.header.observed_at)}
              </time>{' '}
              · {observationAge(detail.header.observed_at, now)} ·{' '}
              {detail.header.read ? 'Read' : 'Unread'}
              {detail.header.hidden ? ' · Hidden' : ''}
            </Text>
            <div className={styles.controls}>
              <Button
                variant="secondary"
                onClick={() =>
                  void model.send({
                    type: 'World',
                    action: {
                      type: 'MarkReportRead',
                      report: detail.header.id,
                    },
                  })
                }
              >
                Mark read
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void model.send({
                    type: 'World',
                    action: {
                      type: 'SetReportHidden',
                      report: detail.header.id,
                      hidden: !detail.header.hidden,
                    },
                  })
                }
              >
                {detail.header.hidden ? 'Unhide' : 'Hide'} report
              </Button>
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
              {detail.payload.kind === 'Combat' &&
                (BigInt(detail.payload.debris.metal) > 0n ||
                  BigInt(detail.payload.debris.crystal) > 0n) && (
                  <>
                    <Button
                      onClick={() => {
                        if (detail.payload.kind === 'Combat')
                          onDraft({
                            coordinates: detail.payload.target,
                            mission: 'Harvest',
                            observedAt: detail.header.observed_at,
                          })
                      }}
                    >
                      Prepare harvest
                    </Button>
                  </>
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
          />
          {detail.payload.kind === 'Combat' && (
            <details className={styles.context}>
              <summary>About harvesting</summary>
              <Text>
                Debris may already have been collected by another fleet.
              </Text>
            </details>
          )}
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
          <div className={styles.controls}>
            <Field className={styles.filter}>
              <Input
                type="checkbox"
                className={styles.checkbox}
                disabled={loading || loadingMore}
                checked={includeHidden}
                onChange={(e) => {
                  setIncludeHidden(e.target.checked)
                  setOlderPages(false)
                  setPage(null)
                }}
              />{' '}
              Show hidden reports
            </Field>
            <Button
              disabled={loading || loadingMore}
              onClick={() => {
                setPage(null)
                setOlderPages(false)
                setRefresh((n) => n + 1)
              }}
            >
              Refresh reports
            </Button>
          </div>
          {!page.items.length && <Text>No reports yet.</Text>}
          {page.items.map((r) => (
            <Panel as="article" className={styles.reportRow} key={r.id}>
              <Link
                onClick={() => void model.recordPresence('AccountVisit', null)}
                {...routeTarget(universe, 'reports', origin, r.id)}
              >
                {label(r.kind)}
              </Link>
              <Text>
                <time dateTime={new Date(r.observed_at).toISOString()}>
                  {exactTime(r.observed_at)}
                </time>{' '}
                · {observationAge(r.observed_at, now)} ·{' '}
                {r.read ? 'Read' : 'Unread'}
                {r.hidden ? ' · Hidden' : ''}
              </Text>
            </Panel>
          ))}
          {page.has_more && (
            <Button
              disabled={loading || loadingMore}
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
