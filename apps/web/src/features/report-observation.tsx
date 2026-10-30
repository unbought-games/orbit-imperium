import { HistoricalAlliances, type PlayerAlliances } from './player-alliance'
import { BodyIllustration } from './body-illustration'
import { BodyIdentity } from './body-identity'
import { readCoordinates } from '../shell/galaxy-location'
import { CoordinateLink } from './coordinate-link'
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
import { NumberValue, ResourceQuantity } from '../ui/number-value'
import { DetectionPercent } from '../ui/detection'
import { groupReportBuildings } from './report-buildings'
import { groupReportResearch } from './report-research'
import type { ObservedLevel } from './report-buildings'
type RecordValue = Record<string, unknown>
const record = (v: unknown): RecordValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as RecordValue)
    : {}
const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : 'Unknown'
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
function Resources({ value }: { value: unknown }) {
  const r = record(value)
  return (
    <div
      className={styles.resources}
      role="group"
      aria-label="Resource amounts"
    >
      {(['metal', 'crystal', 'deuterium'] as const).map((resource) => (
        <ResourceQuantity
          key={resource}
          resource={resource}
          value={
            typeof r[resource] === 'string' &&
            /^(0|[1-9][0-9]*)$/.test(r[resource])
              ? r[resource]
              : null
          }
        />
      ))}
    </div>
  )
}
function Units({ value, emptyLabel }: { value: unknown; emptyLabel: string }) {
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
    <Text>{emptyLabel}</Text>
  )
}
function Levels({
  rows,
  emptyLabel,
}: {
  rows: ObservedLevel[]
  emptyLabel: string
}) {
  return rows.length ? (
    <dl className={styles.levels}>
      {rows.map(([name, level]) => (
        <div key={name}>
          <dt>{label(name)}</dt>
          <dd>Level {text(level)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <Text>{emptyLabel}</Text>
  )
}
function GroupedLevels({
  groups,
  emptyLabel,
  paired = false,
}: {
  paired?: boolean
  groups: { title: string; rows: ObservedLevel[] }[]
  emptyLabel: string
}) {
  return groups.length ? (
    groups.map(({ title, rows }) => (
      <div
        key={title}
        className={paired ? styles.paired : undefined}
        data-paired-levels={paired || undefined}
      >
        <h4>{title}</h4>
        <Levels rows={rows} emptyLabel={emptyLabel} />
      </div>
    ))
  ) : (
    <Text>{emptyLabel}</Text>
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
type ObservationProps = {
  payload: RecordValue
  viewer?: string
  playerNames?: PlayerNames
  playerAlliances?: PlayerAlliances
  combatActions?: ReactNode
  targetActions?: ReactNode
  shared?: boolean
}
export function ReportObservation(props: ObservationProps) {
  return (
    <HistoricalAlliances.Provider value={props.playerAlliances ?? {}}>
      <ReportObservationContent {...props} />
    </HistoricalAlliances.Provider>
  )
}
function ReportObservationContent({
  payload,
  viewer,
  playerNames,
  combatActions,
  targetActions,
  shared = false,
}: ObservationProps) {
  const kind = payload.kind
  if (kind === 'MissileImpact')
    return (
      <Panel
        as="section"
        aria-label="Missile impact report"
        className={styles.observation}
      >
        <Heading level={3}>Missile impact</Heading>
        <Text>
          <PlayerName player={text(payload.attacker)} names={playerNames} /> ·{' '}
          <CoordinateLink at={payload.origin} label="origin" /> →{' '}
          <CoordinateLink at={payload.target} label="target" />
        </Text>
        {payload.outcome === 'NoTarget' ? (
          <Text>
            The target was no longer available. No interceptors were consumed
            and no defenses were damaged.
          </Text>
        ) : (
          <>
            <dl className={styles.grid}>
              {[
                ['Sent', payload.sent],
                ['Intercepted', payload.intercepted],
                ['Penetrating', payload.penetrating],
                ...('interceptors_remaining' in payload
                  ? [
                      [
                        'Your interceptors remaining',
                        payload.interceptors_remaining,
                      ],
                    ]
                  : []),
              ].map(([name, value]) => (
                <div key={text(name)}>
                  <dt>{text(name)}</dt>
                  <dd>
                    <NumberValue value={text(value)} />
                  </dd>
                </div>
              ))}
            </dl>
            <Heading level={3}>Permanently destroyed defenses</Heading>
            <Units
              value={Object.entries(record(payload.destroyed)).map(
                ([id, count]) => ({ item: { id }, count }),
              )}
              emptyLabel="No defenses destroyed"
            />
            <Text>Missile damage has no defense recovery or debris.</Text>
          </>
        )}
      </Panel>
    )
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
        <Text>
          Destination{' '}
          <CoordinateLink
            at={payload.destination_coordinates}
            label="destination"
          />
        </Text>
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
    const coordinates = readCoordinates(target.coordinates)
    return (
      <Panel
        as="section"
        aria-label="Report observation"
        className={styles.observation}
      >
        <div className={styles.targetSection} aria-label="Espionage target">
          <Heading level={3} className={styles.targetHeading}>
            Target
          </Heading>
          <div className={styles.target}>
            <div className={styles.targetIdentity}>
              {coordinates && typeof target.body === 'string' && (
                <BodyIllustration
                  body={{
                    id: target.body,
                    kind: target.kind === 'Moon' ? 'Moon' : 'Planet',
                    coordinates,
                  }}
                  className={styles.planet}
                  sizes="36px"
                />
              )}
              <div className={styles.targetInfo}>
                <span className={styles.targetName}>
                  <PlayerName
                    messageAction
                    player={text(target.owner)}
                    names={playerNames}
                  />
                </span>
                <span className={styles.targetDetails}>
                  <BodyIdentity
                    coordinatesHidden={shared && !target.coordinates}
                    name={target.name}
                    kind={target.kind === 'Moon' ? 'Moon' : 'Planet'}
                    at={target.coordinates}
                    label="target"
                  />
                </span>
              </div>
            </div>
            {targetActions}
          </div>
        </div>
        <KnownSection title="Resources" value={payload.resources}>
          {(v) => <Resources value={v} />}
        </KnownSection>
        <KnownSection title="Stationed ships" value={payload.fleet}>
          {(v) => <Units value={v} emptyLabel="No stationed ships" />}
        </KnownSection>
        <KnownSection title="Defenses" value={payload.defenses}>
          {(v) => <Units value={v} emptyLabel="No defenses" />}
        </KnownSection>
        <KnownSection title="Buildings" value={payload.buildings}>
          {(v) => (
            <GroupedLevels
              paired
              groups={groupReportBuildings(record(v))}
              emptyLabel="No buildings"
            />
          )}
        </KnownSection>
        <KnownSection title="Research" value={payload.research}>
          {(v) => (
            <GroupedLevels
              groups={groupReportResearch(record(v))}
              emptyLabel="No research"
            />
          )}
        </KnownSection>
        <footer className={styles.footnotes}>
          <Text>
            Activity before contact:{' '}
            {activity.type === 'Minutes'
              ? `${text(activity.minutes)} minutes`
              : text(activity.type)}
            . Fleet contact may cause activity.
          </Text>
          <Risk value={payload.counterespionage} />
        </footer>
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
          <PlayerName
            messageAction
            player={text(payload.sender)}
            names={playerNames}
          />{' '}
          made espionage contact from{' '}
          <CoordinateLink at={payload.origin} label="origin" /> at{' '}
          <CoordinateLink at={payload.target} label="target" />.
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
            Combat report ·{' '}
            <BodyIdentity
              at={payload.target}
              label="target"
              coordinatesHidden={shared && !payload.target}
            />
          </p>
          <Heading level={2} className={combatStyles.result}>
            Your fleet was destroyed
          </Heading>
          <p className={combatStyles.explanation}>
            Contact lost in the first round. The defender’s outcome is unknown.
          </p>
        </header>
        <Heading level={3}>Your ships lost</Heading>
        <Units value={payload.own_lost_ships} emptyLabel="No ships lost" />
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
        actions={combatActions}
        shared={shared}
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
        className={
          kind === 'Harvested'
            ? `${styles.observation} ${styles.harvest}`
            : styles.observation
        }
      >
        <Text>
          {label(text(kind))}
          {kind === 'Delivered' || payload.origin_coordinates ? (
            <>
              {' · '}
              {kind === 'Delivered' &&
                typeof payload.origin_name === 'string' &&
                `${payload.origin_name} `}
              <CoordinateLink
                at={
                  kind === 'Delivered'
                    ? payload.origin
                    : payload.origin_coordinates
                }
                label="origin"
              />
              {' → '}
              {kind === 'Delivered' &&
                typeof payload.target_name === 'string' &&
                `${payload.target_name} `}
              <CoordinateLink
                at={
                  kind === 'Delivered'
                    ? payload.target
                    : payload.destination_coordinates
                }
                label="destination"
              />
            </>
          ) : payload.target ? (
            <>
              {' · Destination '}
              <CoordinateLink at={payload.target} label="destination" />
            </>
          ) : null}
        </Text>
        {kind === 'Harvested' && (
          <>
            <Heading level={3}>Harvested resources</Heading>
            {payload.harvested ? (
              <Resources value={payload.harvested} />
            ) : (
              <Text>
                Harvested amount unavailable. This older report recorded only
                total carried resources, including cargo loaded before
                departure.
              </Text>
            )}
          </>
        )}
        {'cargo' in payload && (kind !== 'Harvested' || !payload.harvested) && (
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
            <Units value={payload.ships} emptyLabel="No ships" />
          </>
        )}
      </Panel>
    )
  return <Text>This report version is unavailable in this client.</Text>
}
