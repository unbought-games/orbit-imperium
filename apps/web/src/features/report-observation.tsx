import { Panel } from '../ui/panel'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Heading } from '../ui/typography'
import styles from './report-observation.module.css'
import type { ReactNode } from 'react'
import { label } from '../ui/format'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { DetectionPercent } from '../ui/detection'
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
            <dd>{text(row.count)}</dd>
          </div>
        )
      })}
    </dl>
  ) : (
    <Text>Known empty</Text>
  )
}
function Levels({ value }: { value: unknown }) {
  const rows = Object.entries(record(value))
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
function Origins({ title, value }: { title: string; value: unknown }) {
  return (
    <Section>
      <Heading level={3}>{title}</Heading>
      {list(value).map((v, i) => {
        const origin = record(v)
        return (
          <div key={i}>
            <h4>
              {text(origin.side)} · Player {text(origin.owner).slice(0, 8)}
            </h4>
            {Array.isArray(origin.technology) && (
              <Text>
                Weapons {text(origin.technology[0])} · Shielding{' '}
                {text(origin.technology[1])} · Armour{' '}
                {text(origin.technology[2])}
              </Text>
            )}
            <Units value={origin.units} />
          </div>
        )
      })}
    </Section>
  )
}
export function ReportObservation({ payload }: { payload: RecordValue }) {
  const kind = payload.kind
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
          Target {coordinate(target.coordinates)} · Player{' '}
          {text(target.owner).slice(0, 8)}
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
          {(v) => <Levels value={v} />}
        </KnownSection>
        <KnownSection title="Research" value={payload.research}>
          {(v) => <Levels value={v} />}
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
          Player {text(payload.sender).slice(0, 8)} made espionage contact from{' '}
          {coordinate(payload.origin)} at {coordinate(payload.target)}.
        </Text>
        <Risk value={payload} />
        <Text>The observer’s acquired intelligence is private.</Text>
      </Panel>
    )
  if (kind === 'ContactLost')
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Heading level={3}>Contact lost in the first round</Heading>
        <Text>
          Target {coordinate(payload.target)}. Defender battle details were not
          observed.
        </Text>
        <Units value={payload.own_lost_ships} />
        <Heading level={3}>Your cargo lost</Heading>
        <Resources value={payload.own_cargo_loss} />
      </Panel>
    )
  if (kind === 'Combat')
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <Heading level={3}>{label(text(payload.outcome))}</Heading>
        <Text>
          Target {coordinate(payload.target)} ·{' '}
          {payload.mission === 'Attack'
            ? 'Loot travels home with survivors.'
            : 'Counterespionage grants no plunder.'}
        </Text>
        {'return_at' in payload && (
          <Text>
            {typeof payload.return_at === 'number'
              ? `Survivors return ${new Date(payload.return_at).toLocaleString()}`
              : 'No surviving return fleet.'}
          </Text>
        )}
        {['debris', 'loot', 'own_cargo_loss']
          .filter((k) => k in payload)
          .map((k) => (
            <Section key={k}>
              <Heading level={3}>{label(k)}</Heading>
              <Resources value={payload[k]} />
            </Section>
          ))}
        <Origins title="Starting forces" value={payload.participants} />
        <Origins title="Survivors" value={payload.survivors} />
        <Origins title="Gross losses" value={payload.gross_losses} />
        <Origins title="Defenses recovered" value={payload.recovered} />
        {Array.isArray(payload.permanent_losses) && (
          <Origins title="Permanent losses" value={payload.permanent_losses} />
        )}
        {list(payload.rounds).map((v, i) => {
          const round = record(v)
          return (
            <details key={i}>
              <summary>
                Round {text(round.number)} · {text(round.shots)} shots
              </summary>
              <Text>
                Raw attack <CombatPoints value={round.raw_attack_ticks} />{' '}
                points · Shield damage{' '}
                <CombatPoints value={round.shield_removed_ticks} /> · Hull
                damage <CombatPoints value={round.hull_removed_ticks} /> ·{' '}
                {text(round.explosions)} explosions.
              </Text>
              <Origins title="Round starting forces" value={round.start} />
              <Origins title="Round survivors" value={round.end} />
            </details>
          )
        })}
      </Panel>
    )
  if (
    [
      'Delivered',
      'Returned',
      'Recalled',
      'Harvested',
      'MissionFailed',
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
              {kind === 'Delivered'
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

function CombatPoints({ value }: { value: unknown }) {
  const ticks = text(value)
  return /^(0|[1-9][0-9]*)$/.test(ticks) ? (
    <NumberValue value={ticks} divisor={100000} />
  ) : (
    <>Unknown</>
  )
}
