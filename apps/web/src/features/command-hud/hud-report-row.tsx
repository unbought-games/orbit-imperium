import type { components } from '../../contracts'
import { usePlayerDisplay } from '../../shell/player-profiles-context'
import { formatCompactResource } from '../../ui/compact-resource'
import { ResourceValue } from '../../ui/resource-value'
import { resourceKinds } from '../debris-resources'
import { exactTime } from '../mission-presentation'
import type { PlayerNames } from '../player-label'
import { PlayerName } from '../player-name'
import { type OrbReportGlance, orbReportAge } from './report-glance'
import styles from './hud-inbox.module.css'

type Header = components['schemas']['ReportHeader4']

export function HudReportRow({
  header,
  glance,
  names,
  now,
  onOpen,
}: {
  header: Header
  glance: OrbReportGlance
  names?: PlayerNames
  now: number
  onOpen: () => void
}) {
  const { title, location, icon: Icon, player, harvested } = glance
  const profile = usePlayerDisplay(player ?? '')
  const showIdentity = player && (profile?.username || names?.[player]?.trim())
  const age = orbReportAge(header.observed_at, now)
  const amounts =
    harvested && resourceKinds.filter((kind) => BigInt(harvested[kind]) > 0n)
  return (
    <button
      type="button"
      className={styles.report}
      data-report-tone={glance.tone}
      data-kind={header.kind}
      data-amounts={amounts?.length}
      onClick={onOpen}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className={styles.headline}>
        {title}
        {amounts && harvested && (
          <span className={styles.yield}>
            {amounts.map((kind) => (
              <ResourceValue key={kind} resource={kind} inline>
                {formatCompactResource(harvested[kind])}
              </ResourceValue>
            ))}
          </span>
        )}
      </span>
      <time
        className={styles.age}
        dateTime={new Date(header.observed_at).toISOString()}
        title={exactTime(header.observed_at)}
        aria-label={age.full}
      >
        {age.short}
      </time>
      {(location || showIdentity) && (
        <span className={styles.location}>
          {showIdentity && (
            <PlayerName
              player={player}
              names={names}
              alliance={header.player_alliances?.[player] ?? null}
              interactive={false}
              linkAlliance={false}
            />
          )}
          {showIdentity &&
            location &&
            (header.kind === 'SpyContact' ? ' → ' : ' · ')}
          {location}
        </span>
      )}
    </button>
  )
}
