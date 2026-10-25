import { CoordinateLink } from './coordinate-link'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { Link } from '../ui/link'
import { ResourceMark } from '../ui/resource-mark'
import { ResourceNumber } from '../ui/number-value'
import { Panel } from '../ui/panel'
import { label } from '../ui/format'
import { exactTime } from './mission-presentation'
import { reportPreview, reportAge, reportListTitle } from './report-preview'
import { ReportVisibilityButton } from './report-visibility-button'
import styles from './reports.module.css'

export function ReportListRow({
  report,
  model,
  universe,
  origin,
  now,
  disabled,
}: {
  report: components['schemas']['ReportHeader4']
  model: Coordinator
  universe: string
  origin: string
  now: number
  disabled: boolean
}) {
  const preview = reportPreview(report.preview, model.binding?.player)
  const outcome = reportListTitle(report, model.binding?.player)
  return (
    <Panel
      as="article"
      className={styles.reportRow}
      aria-label={`${outcome.title} report ${exactTime(report.observed_at)}`}
    >
      <div className={styles.reportMain}>
        <div className={styles.rowHeading}>
          <Link
            className={styles.reportLink}
            aria-label={outcome.title}
            onClick={() => void model.recordPresence('AccountVisit', null)}
            {...routeTarget(universe, 'reports', origin, report.id)}
          >
            <strong
              className={outcome.symbol ? styles[outcome.tone] : undefined}
            >
              {outcome.symbol && (
                <span aria-hidden="true">{outcome.symbol} </span>
              )}
              {outcome.title}
            </strong>
            {!report.read && (
              <span
                className={styles.unread}
                aria-label="Unread"
                title="Unread"
              />
            )}
            {report.hidden && <span>Deleted</span>}
          </Link>
          {preview.coordinates && (
            <CoordinateLink
              at={preview.coordinates}
              origin={origin}
              target={report.kind === 'Harvested' ? 'debris' : 'planet'}
              className={styles.location}
            >
              {preview.location}
            </CoordinateLink>
          )}
        </div>
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
      <ReportVisibilityButton
        model={model}
        report={report.id}
        hidden={report.hidden}
        disabled={disabled}
        compact
      />
    </Panel>
  )
}
