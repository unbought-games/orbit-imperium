import { usePlayerDisplays } from '../shell/player-profiles-context'
import { reportMetric, type ReportSort } from './report-triage'
import { ReportStarButton } from './report-star-button'
import { CoordinateLink } from './coordinate-link'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { Link } from '../ui/link'
import { ResourceMark } from '../ui/resource-mark'
import { ResourceNumber } from '../ui/number-value'
import { Panel } from '../ui/panel'
import type { PlayerNames } from './player-label'
import { label, coordinates } from '../ui/format'
import { exactTime } from './mission-presentation'
import {
  reportPreview,
  reportAge,
  reportListTitle,
  reportListIdentity,
} from './report-preview'
import { ReportVisibilityButton } from './report-visibility-button'
import styles from './reports.module.css'

export function ReportListRow({
  report,
  playerNames,
  model,
  universe,
  origin,
  now,
  disabled,
  selected,
  onSelect,
  sort,
}: {
  report: components['schemas']['ReportHeader4']
  playerNames?: PlayerNames
  model: Coordinator
  universe: string
  origin: string
  now: number
  disabled: boolean
  sort?: ReportSort
  selected?: boolean
  onSelect?: (checked: boolean) => void
}) {
  const profiles = usePlayerDisplays()
  const preview = reportPreview(report.preview, model.binding?.player)
  const outcome =
    report.preview?.kind === 'Combat' && report.preview.outcome
      ? reportListTitle(report, model.binding?.player)
      : undefined
  const identity = reportListIdentity(
    report.preview,
    model.binding?.player,
    playerNames,
    report.player_alliances,
    profiles,
  )
  const title = [label(report.kind), outcome?.title, identity]
    .filter(Boolean)
    .join(' · ')
  return (
    <Panel
      as="article"
      className={styles.reportRow}
      aria-label={`${title} report ${exactTime(report.observed_at)}`}
    >
      <div className={styles.reportMain}>
        <div className={styles.rowHeading}>
          {onSelect && (
            <label className={styles.selection}>
              <input
                type="checkbox"
                aria-label={`Select ${title} report ${exactTime(report.observed_at)}`}
                checked={selected}
                disabled={disabled || report.starred}
                onChange={(e) => onSelect(e.target.checked)}
              />
            </label>
          )}
          <Link
            className={styles.reportLink}
            aria-label={title}
            onClick={() => void model.recordPresence('AccountVisit', null)}
            {...routeTarget(universe, 'reports', origin, report.id)}
          >
            <strong className={styles.reportType} data-kind={report.kind}>
              {label(report.kind)}
            </strong>
            {outcome && (
              <span className={styles[outcome.tone]}>
                {outcome.symbol && (
                  <span aria-hidden="true">{outcome.symbol} </span>
                )}
                {outcome.title}
              </span>
            )}
            {!report.read && (
              <span
                className={styles.unread}
                aria-label="Unread"
                title="Unread"
              />
            )}
            {report.hidden && <span>Deleted</span>}
            {identity && (
              <span className={styles.identity} title={identity}>
                {identity}
              </span>
            )}
          </Link>
          {preview.coordinates && (
            <CoordinateLink
              at={preview.coordinates}
              origin={origin}
              target={
                preview.targetKind ??
                (report.kind === 'Harvested' ? 'debris' : 'planet')
              }
              className={styles.location}
            >
              {coordinates({ coordinates: preview.coordinates })}
            </CoordinateLink>
          )}
        </div>
        {(sort === 'fleet' || sort === 'defenses') && (
          <span className={styles.preview}>
            {sort === 'fleet' ? 'Fleet' : 'Defense'} investment:{' '}
            {reportMetric(report, sort) === null ? (
              'Unknown'
            ) : (
              <ResourceNumber value={reportMetric(report, sort)!.toString()} />
            )}
          </span>
        )}
        {preview.facts.length > 0 && (
          <span className={styles.preview}>
            {preview.facts.map((fact, index) => (
              <span className={styles.fact} key={index}>
                {index > 0 && <span aria-hidden="true">·</span>}
                {typeof fact === 'string' ? (
                  fact
                ) : (
                  <>
                    {fact.label && <span>{fact.label}:</span>}
                    {(['metal', 'crystal', 'deuterium'] as const).map(
                      (resource) => (
                        <span
                          key={resource}
                          className={styles.resourceValue}
                          title={label(resource)}
                        >
                          <ResourceMark
                            resource={resource}
                            width={16}
                            height={16}
                            aria-hidden={false}
                            role="img"
                            aria-label={label(resource)}
                          />
                          <ResourceNumber value={fact.resources[resource]} />
                        </span>
                      ),
                    )}
                  </>
                )}
              </span>
            ))}
          </span>
        )}
      </div>

      <time
        className={styles.rowTime}
        dateTime={new Date(report.observed_at).toISOString()}
        title={exactTime(report.observed_at)}
      >
        {reportAge(report.observed_at, now)}
      </time>
      <div className={styles.rowActions}>
        <ReportStarButton
          model={model}
          report={report.id}
          disabled={disabled}
        />
        <ReportVisibilityButton
          model={model}
          report={report.id}
          hidden={report.hidden}
          disabled={disabled}
          compact
        />
      </div>
    </Panel>
  )
}
