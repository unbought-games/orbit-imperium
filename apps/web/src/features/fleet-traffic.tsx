import { useState } from 'react'
import { Rocket } from 'lucide-react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentServerTime,
  pendingFleetLaunches,
} from '../client-model/game-projection'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { EmptyState } from '../ui/empty-state'
import { ButtonLink } from '../ui/button'
import { Heading, Text } from '../ui/typography'
import { SegmentedControl } from '../ui/segmented-control'
import { IncomingFleet } from './incoming-fleet'
import { MissileFlight } from './missile-flight'
import { incomingKey } from './command-hud/model'
import { FleetRecall, MissionFleetCard } from './mission-fleet-card'
import {
  fleetTrafficModel,
  type FleetTrafficScope,
  type FleetTrafficRow,
} from './fleet-traffic-model'
import styles from './missions.module.css'
import fleetStyles from './mission-fleets.module.css'

type View = components['schemas']['BoundView4']
type Props = {
  model: Coordinator
  view: View
  item: string | null
  origin: string
}

export function FleetTraffic({ model, view, item, origin }: Props) {
  const universe = useUniverseName()
  const state = useStore(model.store)
  const [selection, setSelection] = useState<FleetTrafficScope | null>(null)
  const scope = selection ?? 'all'
  const { rows, otherCount } = fleetTrafficModel(view, scope, item)
  const now = currentServerTime(state)
  const launches = pendingFleetLaunches(state).filter((launch) =>
    item ? launch.fleetId === item : scope !== 'other',
  )
  return (
    <section aria-label={item ? 'Mission traffic' : 'Empire fleet traffic'}>
      {!item && (
        <div className={fleetStyles.trafficHeader}>
          <div className={fleetStyles.trafficTitle}>
            <Heading level={2}>Empire fleet traffic</Heading>
            {otherCount > 0 && (
              <span
                className={fleetStyles.detected}
                aria-label={`${otherCount} other incoming movements detected`}
              >
                {otherCount} incoming
              </span>
            )}
          </div>
          {(otherCount > 0 || selection !== null) && (
            <SegmentedControl
              label="Fleet traffic filter"
              options={[
                { value: 'all', label: 'All' },
                { value: 'own', label: 'Yours' },
                { value: 'other', label: 'Others' },
              ]}
              value={scope}
              onChange={setSelection}
            />
          )}
        </div>
      )}
      {!rows.length && !launches.length && (
        <EmptyState
          icon={Rocket}
          variant="compact"
          headingLevel={3}
          title={
            item
              ? 'Fleet unavailable.'
              : scope === 'own'
                ? 'No active fleets of your own.'
                : scope === 'other'
                  ? 'No other fleets detected.'
                  : 'No active fleets.'
          }
          description={
            item
              ? 'This mission may have completed. Check reports for its outcome.'
              : scope === 'other'
                ? 'Detected approaches to your worlds will appear here.'
                : 'Your missions and detected arrivals will appear here.'
          }
          actions={
            item ? (
              <ButtonLink {...routeTarget(universe, 'reports', origin)}>
                View reports
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      {launches.map(({ attempt, fleetId, canRecall, recalling }) => (
        <article className={styles.fleet} key={attempt.envelope.command_id}>
          <Heading level={3}>Fleet dispatch in progress</Heading>
          <Text>
            {attempt.status === 'uncertain'
              ? 'Awaiting launch confirmation. Reserved ships and cargo will reconcile with the server.'
              : 'Departure order accepted; awaiting the game result.'}
          </Text>
          {fleetId && canRecall && (
            <FleetRecall model={model} fleetId={fleetId} />
          )}
          {recalling && (
            <Text>Recall requested · awaiting the game result.</Text>
          )}
        </article>
      ))}
      {rows.length > 0 && (
        <div className={fleetStyles.list} data-detail={!!item || undefined}>
          {rows.map((row) => (
            <TrafficCard
              key={`${row.side}:${row.side === 'other' && row.movement.kind === 'fleet' ? incomingKey(row.movement.flight) : row.movement.key}:${!!item}`}
              row={row}
              model={model}
              view={view}
              origin={origin}
              item={item}
              now={now}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TrafficCard({
  row,
  model,
  view,
  item,
  origin,
  now,
}: Props & { row: FleetTrafficRow; now: number }) {
  if (row.movement.kind === 'missile')
    return (
      <MissileFlight
        flight={row.movement.flight}
        view={view}
        now={now}
        origin={origin}
        detail={!!item}
      />
    )
  if (row.side === 'other')
    return (
      <IncomingFleet
        fleet={row.movement.flight}
        view={view}
        now={now}
        origin={origin}
      />
    )
  return (
    <MissionFleetCard
      model={model}
      view={view}
      fleet={row.movement.flight}
      detail={!!item}
      origin={origin}
    />
  )
}
