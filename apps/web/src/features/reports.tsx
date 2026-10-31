import { ReportAttackButton } from './report-attack-button'
import { useReportCleanup } from './use-report-cleanup'
import { useState } from 'react'
import { ReportStarButton } from './report-star-button'
import {
  ReportTriageControls,
  type ReportPanel,
} from './report-triage-controls'
import { defaultReportOptions } from './report-list-options'
import { ReportSelectionBar } from './report-selection-bar'
import { ErrorBannerMessage } from '../ui/error-banner'
import controlStyles from './report-controls.module.css'
import { triageReports, type ReportFolder } from './report-triage'
import { ReportSimulation } from './combat-simulation'
import { ReportShareControl } from './report-share-control'
import { useProfileSource } from '../shell/player-profiles-context'
import { Link } from '../ui/link'
import { Button, ButtonLink } from '../ui/button'
import { ArrowLeft, ArrowRight, FileText, X } from 'lucide-react'
import { EmptyState } from '../ui/empty-state'
import { resolveDestination } from '../shell/routes'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { ReportListRow } from './report-list-row'
import { TaskHeader } from '../ui/task-header'
import { SegmentedControl } from '../ui/segmented-control'
import styles from './reports.module.css'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { ReportObservation } from './report-observation'
import { reportFailure } from './report-failure'
import { ReportVisibilityButton } from './report-visibility-button'
import { useReports } from './use-reports'
import type { DispatchDraft } from './missions'
import { useStore } from 'zustand'
import { currentServerTime } from '../client-model/game-projection'
import { Popover } from '../ui/popover'
import { reportAge, reportKindLabel } from './report-preview'
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
  const [folder, setFolder] = useState<ReportFolder>('inbox')
  const archived = folder === 'archived'
  const [selecting, setSelecting] = useState(false)
  const [panel, setPanel] = useState<ReportPanel>(null)
  const [options, setOptions] = useState(defaultReportOptions)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const cleanup = useReportCleanup(model, () => setSelected(new Set()))
  const filtered = options.status !== 'all' || options.kind !== 'all'
  const allReports =
    selecting ||
    panel !== null ||
    filtered ||
    options.sort !== 'newest' ||
    archived
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
  } = useReports(model, item, allReports, cleanup.submitting, archived)
  const visible = triageReports(
    page?.items ?? [],
    options.sort,
    false,
    options.status,
    false,
    folder,
    options.kind,
  )
  const folderCount =
    page?.items.filter((r) => r.hidden === archived).length ?? 0
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
    (BigInt(combat.debris.metal) > 0n ||
      BigInt(combat.debris.crystal) > 0n ||
      BigInt(combat.debris.deuterium) > 0n) ? (
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
      {!item && (
        <TaskHeader>
          <div className={styles.headerHeading}>
            <h2>Reports</h2>
            <SegmentedControl<ReportFolder>
              label="Report folder"
              options={[
                { value: 'inbox', label: 'Inbox' },
                { value: 'archived', label: 'Archived' },
              ]}
              value={folder}
              disabled={cleanup.submitting || changingVisibility}
              onChange={(next) => {
                setFolder(next)
                setPanel(null)
                setSelected(new Set())
              }}
            />
          </div>
          <ReportTriageControls
            panel={panel}
            setPanel={setPanel}
            options={options}
            change={(next) => {
              setOptions(next)
              setSelected(new Set())
            }}
            selecting={selecting}
            setSelecting={(next) => {
              setSelecting(next)
              setSelected(new Set())
            }}
            archived={archived}
            disabled={cleanup.submitting || changingVisibility}
            complete={complete}
            reports={page?.items ?? []}
            cleanup={cleanup}
            now={now}
          />
        </TaskHeader>
      )}
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
                {reportKindLabel(detail.header.kind)}
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
              {detail.payload.kind === 'Espionage' && (
                <ReportSimulation
                  key={detail.header.id}
                  model={model}
                  report={detail.payload}
                />
              )}
              {['Combat', 'ContactLost', 'Espionage'].includes(
                detail.payload.kind,
              ) && (
                <ReportShareControl model={model} report={detail.header.id} />
              )}
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
            playerAlliances={detail.player_alliances}
            combatActions={harvestAction}
            targetActions={
              <ReportAttackButton
                model={model}
                payload={detail.payload}
                observedAt={detail.header.observed_at}
                onDraft={onDraft}
              />
            }
          />

          {detail.payload.kind === 'Colonized' && (
            <div className={styles.controls}>
              <Link
                data-touch-control=""
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
          {archived && !complete && error === null && (
            <Text role="status">Loading archived reports…</Text>
          )}
          {allReports && !archived && !complete && error === null && (
            <Text role="status">Loading reports…</Text>
          )}
          {filtered && (
            <div
              className={controlStyles.filters}
              aria-label="Active report filters"
              role="group"
            >
              {options.kind !== 'all' && (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${reportKindLabel(options.kind)} filter`}
                  onClick={() => {
                    setOptions({ ...options, kind: 'all' })
                    setSelected(new Set())
                  }}
                >
                  {reportKindLabel(options.kind)}
                  <X size={16} aria-hidden="true" />
                </Button>
              )}
              {options.status !== 'all' && (
                <Button
                  variant="ghost"
                  aria-label={`Remove ${options.status} filter`}
                  onClick={() => {
                    setOptions({ ...options, status: 'all' })
                    setSelected(new Set())
                  }}
                >
                  {options.status === 'unread' ? 'Unread' : 'Starred'}
                  <X size={16} aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
          {selecting && (
            <ReportSelectionBar
              visible={visible}
              selected={selected}
              select={setSelected}
              archived={archived}
              disabled={!complete || changingVisibility}
              cleanup={cleanup}
              onCancel={() => {
                setSelecting(false)
                setSelected(new Set())
              }}
            />
          )}
          {cleanup.error && panel !== 'cleanup' && (
            <ErrorBannerMessage>
              <p role="alert">{cleanup.error}</p>
            </ErrorBannerMessage>
          )}
          {cleanup.submitting && <Text role="status">Archiving reports…</Text>}
          {!visible.length && error === null && (!allReports || complete) && (
            <EmptyState
              className={styles.emptyReports}
              icon={FileText}
              eyebrow={archived ? 'Archived' : 'Inbox'}
              title={
                folderCount
                  ? 'No reports match these filters.'
                  : 'No reports to show.'
              }
              description={
                folderCount
                  ? 'Try a different filter.'
                  : archived
                    ? 'Reports you archive appear here. Use Move to inbox to restore them.'
                    : 'Fleet arrivals, espionage findings, and battle outcomes will appear here as your missions unfold.'
              }
              actions={
                folderCount ? (
                  <Button
                    onClick={() => {
                      setOptions(defaultReportOptions)
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
              sort={options.sort}
              selected={selected.has(r.id)}
              onSelect={
                selecting
                  ? (checked) =>
                      setSelected((ids) => {
                        const next = new Set(ids)
                        if (checked) next.add(r.id)
                        else next.delete(r.id)
                        return next
                      })
                  : undefined
              }
              disabled={
                loadingMore || (selecting && !complete) || cleanup.submitting
              }
            />
          ))}
          {page.has_more && !allReports && (
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
