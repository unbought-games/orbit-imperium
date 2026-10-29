import { Radar, Rocket } from 'lucide-react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentServerTime,
  occupiedFleetSlots,
  pendingFleetLaunches,
} from '../client-model/game-projection'
import { useProfileSource } from '../shell/player-profiles-context'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { EmptyState } from '../ui/empty-state'
import { ButtonLink } from '../ui/button'
import { Link } from '../ui/link'
import { Heading, Text } from '../ui/typography'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { TaskHeader } from '../ui/task-header'
import { IncomingFleet } from './incoming-fleet'
import { FleetSlots } from './fleet-slots'
import { FleetInventory } from './fleet-inventory'
import { FleetRecall, MissionFleetCard } from './mission-fleet-card'
import { chronologicalFleets } from './mission-presentation'
import styles from './missions.module.css'
import fleetStyles from './mission-fleets.module.css'
type S = components['schemas']

export function MissionFleets({
  model,
  view,
  item,
  origin,
}: {
  model: Coordinator
  view: S['BoundView4']
  item: string | null
  origin: string
}) {
  const universeName = useUniverseName()
  const state = useStore(model.store)
  useProfileSource(item ? null : { type: 'Incoming' }, view.viewer_revision)
  const now = currentServerTime(state)
  const fleets = chronologicalFleets(
    view.missions.fleets.filter((fleet) => !item || fleet.id === item),
  )
  const launches = pendingFleetLaunches(state).filter(
    (launch) => !item || launch.fleetId === item,
  )
  return (
    <section className={styles.screen}>
      <TaskHeader title={item ? 'Mission details' : undefined}>
        <div className={styles.actions}>
          {item && (
            <Link
              data-touch-control=""
              {...routeTarget(universeName, 'fleets', origin)}
            >
              All fleets
            </Link>
          )}
          <ButtonLink {...routeTarget(universeName, 'dispatch', origin)}>
            Dispatch Fleet
          </ButtonLink>
          <FleetSlots
            used={occupiedFleetSlots(state)}
            total={view.missions.fleet_slots}
          />
        </div>
      </TaskHeader>
      {!fleets.length && !launches.length && (
        <EmptyState
          icon={Rocket}
          variant="compact"
          title={item ? 'Fleet unavailable.' : 'No active fleets.'}
          description={
            item
              ? 'This mission may have completed. Check reports for its outcome.'
              : 'Prepare a mission from the ships stationed at your worlds. Track its journey here from launch to return.'
          }
          actions={
            item ? (
              <ButtonLink {...routeTarget(universeName, 'reports', origin)}>
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
      {fleets.length > 0 && (
        <div className={fleetStyles.list} data-detail={!!item || undefined}>
          {fleets.map((fleet) => (
            <MissionFleetCard
              key={`${fleet.id}:${!!item}`}
              model={model}
              view={view}
              fleet={fleet}
              detail={!!item}
              origin={origin}
            />
          ))}
        </div>
      )}
      {!item && (
        <section className={styles.incoming} aria-label="Incoming fleets">
          <Heading level={2}>Incoming fleets</Heading>
          {!view.missions.incoming.length && (
            <EmptyState
              icon={Radar}
              variant="compact"
              headingLevel={3}
              title="No visible incoming fleets."
              description="Detected arrivals will appear here."
            />
          )}
          {view.missions.incoming.map((fleet, index) => (
            <IncomingFleet key={index} fleet={fleet} view={view} now={now} />
          ))}
        </section>
      )}
      {!item && <FleetInventory model={model} origin={origin} />}
      <details className={styles.rules}>
        <summary>Fleet slots and protection</summary>
        <Text>Returning fleets occupy a slot.</Text>
        <Text>
          Completed-asset score:{' '}
          <NumberValue
            value={view.missions.score_value_micro}
            divisor={1000000000}
          />{' '}
          points. Invested resources:{' '}
          <ResourceNumber value={view.missions.score_value_micro} /> resources.
          Protection uses the full value before display rounding.
        </Text>
      </details>
    </section>
  )
}
