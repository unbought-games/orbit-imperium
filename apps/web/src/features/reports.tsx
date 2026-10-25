import { useState } from 'react'
import { ReportStarButton } from './report-star-button'
import { ReportTriageControls, defaultTriage } from './report-triage-controls'
import { triageReports } from './report-triage'
import { useProfileSource } from '../shell/player-profiles-context'
import { Link } from '../ui/link'
import { Button, ButtonLink } from '../ui/button'
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import { resolveDestination } from '../shell/routes'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { ReportListRow } from './report-list-row'
import { TaskHeader } from '../ui/task-header'
import styles from './reports.module.css'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { ReportObservation } from './report-observation'
import { reportFailure } from './report-failure'
import { ReportVisibilityButton } from './report-visibility-button'
import { useReports } from './use-reports'
import type { DispatchDraft } from './missions'
import { label } from '../ui/format'
import { useStore } from 'zustand'
import { currentServerTime } from '../client-model/game-projection'
import { Popover } from '../ui/popover'
import { reportAge } from './report-preview'
import { exactTime } from './mission-presentation'
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
  const [triage, setTriage] = useState(false)
  const [options, setOptions] = useState(defaultTriage)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const now = useStore(model.store, currentServerTime)
  const {
    page,
    detail,
    error,
    loading,
    loadingMore,
    changingVisibility,
    more,
    retry,
  } = useReports(model, item, triage)
  const visible = triageReports(
    page?.items ?? [],
    options.sort,
    options.ascending,
    options.filter,
    options.knownOnly,
  )
  const complete =
    !!page && !page.has_more && !loading && !loadingMore && error === null

  useProfileSource(
    detail && detail.header.id === item
      ? { type: 'Report', report: detail.header.id }
      : null,
    model.view?.viewer_revision,
  )
  const failure = reportFailure(error)
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
              retry()
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
            <div className={styles.detailHeading}>
              <Heading level={2} className={styles.detailTitle}>
                {label(detail.header.kind)}
              </Heading>
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
            </div>
            <div className={styles.controls}>
              <ReportStarButton model={model} report={detail.header.id} />
              <ReportVisibilityButton
                model={model}
                report={detail.header.id}
                hidden={detail.header.hidden}
                compact
                disabled={false}
              />
            </div>
          </div>
          <ReportObservation
            payload={detail.payload}
            viewer={model.binding?.player}
            playerNames={detail.player_names}
            combatActions={harvestAction}
            targetActions={
              <>
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
                      Attack
                    </Button>
                  )}
              </>
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
          <Button
            variant="secondary"
            aria-expanded={triage}
            onClick={() => {
              setTriage(!triage)
              setOptions(defaultTriage)
              setSelected(new Set())
            }}
          >
            Sort, filter & clean up
          </Button>
          {triage && (
            <>
              {!complete && error === null && (
                <Text role="status">
                  Loading the complete inbox before sorting and cleanup…
                </Text>
              )}
              <ReportTriageControls
                model={model}
                reports={page.items}
                visible={visible}
                options={options}
                change={(next) => {
                  setOptions(next)
                  setSelected(new Set())
                }}
                selected={selected}
                select={setSelected}
                disabled={!complete || changingVisibility}
                now={now}
              />
              {complete && (
                <Text role="status">
                  {visible.length} of {page.items.length} reports match.
                </Text>
              )}
            </>
          )}
          {!visible.length && error === null && (!triage || complete) && (
            <EmptyState
              icon={FileText}
              eyebrow="Mission archive"
              title={
                page.items.length
                  ? 'No reports match these filters.'
                  : 'No reports to show.'
              }
              description={
                page.items.length
                  ? 'Try a different report filter or include unknown observations.'
                  : 'Fleet arrivals, espionage findings, and battle outcomes will appear here as your missions unfold.'
              }
              actions={
                page.items.length ? (
                  <Button
                    onClick={() => {
                      setOptions(defaultTriage)
                      setSelected(new Set())
                    }}
                  >
                    Clear filters
                  </Button>
                ) : (
                  model.view &&
                  resolveDestination(
                    {
                      universe: model.view.binding.universe,
                      body: origin,
                      page: 'galaxy',
                    },
                    model.view,
                  ).available && (
                    <ButtonLink {...routeTarget(universe, 'galaxy', origin)}>
                      Explore the galaxy{' '}
                      <ArrowRight size={16} aria-hidden="true" />
                    </ButtonLink>
                  )
                )
              }
            />
          )}
          {visible.map((r) => (
            <ReportListRow
              key={r.id}
              report={r}
              playerNames={page.player_names}
              model={model}
              universe={universe}
              origin={origin}
              now={now}
              sort={triage ? options.sort : undefined}
              selected={selected.has(r.id)}
              onSelect={
                triage
                  ? (checked) =>
                      setSelected((ids) => {
                        const next = new Set(ids)
                        if (checked) next.add(r.id)
                        else next.delete(r.id)
                        return next
                      })
                  : undefined
              }
              disabled={loadingMore || (triage && !complete)}
            />
          ))}
          {page.has_more && !triage && (
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
