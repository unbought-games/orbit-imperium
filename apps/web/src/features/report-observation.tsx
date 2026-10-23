import type { PlayerNames } from './player-label'
import { PlayerName } from './player-name'
import { CombatReport } from './combat-report'
import { Panel } from '../ui/panel'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Heading } from '../ui/typography'
import styles from './report-observation.module.css'
import combatStyles from './combat-report.module.css'
import type { ReactNode } from 'react'
import { label } from '../ui/format'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { DetectionPercent } from '../ui/detection'
import { groupReportBuildings } from './report-buildings'
import type { ObservedLevel } from './report-buildings'
type RecordValue = Record<string, unknown>
const record = (v: unknown): RecordValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as RecordValue)
    : {}
const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : 'Unknown'
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const coordinate = (v: unknown) => {
  const c = record(v)
  return [c.galaxy, c.system, c.position].every((x) => typeof x === 'number')
    ? `[${c.galaxy}:${c.system}:${c.position}]`
    : 'Unavailable'
}
function Resources({ value }: { value: unknown }) {
  const r = record(value)
  return (
    <dl className={styles.grid}>
      {['metal', 'crystal', 'deuterium'].map((k) => (
        <div key={k}>
          <dt>{label(k)}</dt>
          <dd>
            {typeof r[k] === 'string' && /^(0|[1-9][0-9]*)$/.test(r[k]) ? (
              <ResourceNumber value={r[k]} />
            ) : (
              'Unknown'
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
function Units({ value }: { value: unknown }) {
  const units = list(value)
  return units.length ? (
    <dl className={styles.grid}>
      {units.map((unit, i) => {
        const row = record(unit),
          item = record(row.item)
        return (
          <div key={i}>
            <dt>{label(text(item.id ?? row.ship_type))}</dt>
            <dd>
              {typeof row.count === 'string' &&
              /^(0|[1-9][0-9]*)$/.test(row.count) ? (
                <NumberValue value={row.count} />
              ) : (
                'Unknown'
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  ) : (
    <Text>Known empty</Text>
  )
}
function Levels({ rows }: { rows: ObservedLevel[] }) {
  return rows.length ? (
    <dl className={styles.grid}>
      {rows.map(([name, level]) => (
        <div key={name}>
          <dt>{label(name)}</dt>
          <dd>Level {text(level)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <Text>Known empty</Text>
  )
}
function Buildings({ value }: { value: unknown }) {
  const groups = groupReportBuildings(record(value))
  return groups.length ? (
    groups.map(({ title, rows }) => (
      <div key={title}>
        <h4>{title}</h4>
        <Levels rows={rows} />
      </div>
    ))
  ) : (
    <Text>Known empty</Text>
  )
}
function KnownSection({
  title,
  value,
  children,
}: {
  title: string
  value: unknown
  children: (known: unknown) => ReactNode
}) {
  const observation = record(value)
  return (
    <Section>
      <Heading level={3}>{title}</Heading>
      {observation.visibility === 'Known' ? (
        children(observation.value)
      ) : (
        <Text>Unknown — this observation did not reveal this section.</Text>
      )}
    </Section>
  )
}
function Risk({ value }: { value: unknown }) {
  const r = record(value)
  return (
    <Text>
      Counterespionage:{' '}
      {typeof r.probability_ppm === 'number' ? (
        <>
          <DetectionPercent value={r.probability_ppm} /> ({r.probability_ppm}{' '}
          parts per million)
        </>
      ) : (
        'Unknown probability'
      )}
      .{' '}
      {r.detected === true
        ? 'Detected — combat resolved.'
        : r.detected === false
          ? 'Undetected.'
          : 'Detection outcome unknown.'}
    </Text>
  )
}
export function ReportObservation({
  payload,
  viewer,
  playerNames,
}: {
  payload: RecordValue
  viewer?: string
  playerNames?: PlayerNames
}) {
  const kind = payload.kind
  if (kind === 'Colonized' || kind === 'ColonizationFailed') {
    const reasons: Record<string, string> = {
      Occupied: 'The position was occupied at arrival.',
      PositionLocked: 'The position was not unlocked at arrival.',
      ColonyCapacity: 'Your planet limit was full at arrival.',
    }
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Heading level={3}>
          {kind === 'Colonized' ? 'Colony established' : 'Colonization failed'}
        </Heading>
        <Text>Destination {coordinate(payload.destination_coordinates)}</Text>
        {kind === 'Colonized' ? (
          <>
            <Text>
              Consumed one Colony Ship. {text(payload.fields)} fields ·{' '}
              {text(payload.diameter_km)} km diameter ·{' '}
              {text(payload.min_temperature)} to {text(payload.max_temperature)}{' '}
              °C.
            </Text>
            <Heading level={3}>Resources at founding</Heading>
            <Resources value={payload.resources} />
          </>
        ) : (
          <Text>
            {reasons[text(payload.reason)] ??
              'Arrival could not establish a colony.'}{' '}
            All ships and cargo return; fuel is not refunded.
          </Text>
        )}
        <Text>
          {typeof payload.return_at === 'number'
            ? `Return arrival: ${new Date(payload.return_at).toLocaleString()}.`
            : 'No ships remain to return; the fleet slot is released.'}
        </Text>
      </Panel>
    )
  }
  if (kind === 'Espionage') {
    const target = record(payload.target),
      activity = record(payload.activity)
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Text>
          Target {coordinate(target.coordinates)} ·{' '}
          <PlayerName player={text(target.owner)} names={playerNames} />
        </Text>
        <Text>
          Activity before contact:{' '}
          {activity.type === 'Minutes'
            ? `${text(activity.minutes)} minutes`
            : text(activity.type)}
          . Fleet contact may cause activity.
        </Text>
        <Risk value={payload.counterespionage} />
        <KnownSection title="Resources" value={payload.resources}>
          {(v) => <Resources value={v} />}
        </KnownSection>
        <KnownSection title="Stationed ships" value={payload.fleet}>
          {(v) => <Units value={v} />}
        </KnownSection>
        <KnownSection title="Defenses" value={payload.defenses}>
          {(v) => <Units value={v} />}
        </KnownSection>
        <KnownSection title="Buildings" value={payload.buildings}>
          {(v) => <Buildings value={v} />}
        </KnownSection>
        <KnownSection title="Research" value={payload.research}>
          {(v) => <Levels rows={Object.entries(record(v))} />}
        </KnownSection>
      </Panel>
    )
  }
  if (kind === 'SpyContact')
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Text>
          <PlayerName player={text(payload.sender)} names={playerNames} /> made
          espionage contact from {coordinate(payload.origin)} at{' '}
          {coordinate(payload.target)}.
        </Text>
        <Risk value={payload} />
        <Text>The observer’s acquired intelligence is private.</Text>
      </Panel>
    )
  if (kind === 'ContactLost')
    return (
      <section aria-label="Report observation" className={combatStyles.report}>
        <header className={`${combatStyles.outcome} ${combatStyles.loss}`}>
          <p className={combatStyles.kicker}>
            Combat report · {coordinate(payload.target)}
          </p>
          <Heading level={2} className={combatStyles.result}>
            Your fleet was destroyed
          </Heading>
          <p className={combatStyles.explanation}>
            Contact lost in the first round. The defender’s outcome is unknown.
          </p>
        </header>
        <Heading level={3}>Your ships lost</Heading>
        <Units value={payload.own_lost_ships} />
        <div className={combatStyles.resources}>
          <div className={combatStyles.resourceGroup}>
            <h3>Your cargo lost</h3>
            <Resources value={payload.own_cargo_loss} />
          </div>
        </div>
      </section>
    )
  if (kind === 'Combat')
    return (
      <CombatReport
        payload={payload}
        viewer={viewer}
        playerNames={playerNames}
      />
    )

  if (
    [
      'Delivered',
      'Returned',
      'Recalled',
      'Harvested',
      'MissionFailed',
      'Deployed',
    ].includes(text(kind))
  )
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Text>
          {label(text(kind))}
          {payload.origin_coordinates
            ? ` · ${coordinate(payload.origin_coordinates)} → ${coordinate(payload.destination_coordinates)}`
            : payload.target
              ? ` · Destination ${coordinate(payload.target)}`
              : ''}
        </Text>
        {'cargo' in payload && (
          <>
            <Heading level={3}>
              {kind === 'Delivered' || kind === 'Deployed'
                ? 'Delivered resources'
                : 'Carried resources'}
            </Heading>
            <Resources value={payload.cargo} />
          </>
        )}
        {'ships' in payload && (
          <>
            <Heading level={3}>Your ships</Heading>
            <Units value={payload.ships} />
          </>
        )}
      </Panel>
    )
  return <Text>This report version is unavailable in this client.</Text>
}
