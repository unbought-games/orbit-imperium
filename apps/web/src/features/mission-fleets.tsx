import { MissileFlight } from './missile-flight'
import { incomingMovements, outgoingMovements } from './fleet-movements'
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
import { TaskHeader } from '../ui/task-header'
import { IncomingFleet } from './incoming-fleet'
import { incomingKey } from './command-hud/model'
import { FleetSlots } from './fleet-slots'
import { FleetInventory } from './fleet-inventory'
import { FleetRecall, MissionFleetCard } from './mission-fleet-card'
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
  const movements = outgoingMovements(view, item)
  const incoming = incomingMovements(view)
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
      {!movements.length && !launches.length && (
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
      {movements.length > 0 && (
        <div className={fleetStyles.list} data-detail={!!item || undefined}>
          {movements.map((movement) =>
            movement.kind === 'missile' ? (
              <MissileFlight
                key={movement.key}
                flight={movement.flight}
                view={view}
                now={now}
                origin={origin}
                detail={!!item}
              />
            ) : (
              <MissionFleetCard
                key={`${movement.key}:${!!item}`}
                model={model}
                view={view}
                fleet={movement.flight}
                detail={!!item}
                origin={origin}
              />
            ),
          )}
        </div>
      )}
      {!item && (
        <section className={styles.incoming} aria-label="Incoming fleets">
          <Heading level={2}>Incoming fleets</Heading>
          {!incoming.length && (
            <EmptyState
              icon={Radar}
              variant="compact"
              headingLevel={3}
              title="No visible incoming fleets."
              description="Detected arrivals will appear here."
            />
          )}
          <div className={fleetStyles.list}>
            {incoming.map((movement) =>
              movement.kind === 'missile' ? (
                <MissileFlight
                  key={movement.key}
                  flight={movement.flight}
                  view={view}
                  now={now}
                />
              ) : (
                <IncomingFleet
                  key={incomingKey(movement.flight)}
                  fleet={movement.flight}
                  view={view}
                  now={now}
                />
              ),
            )}
          </div>
        </section>
      )}
      {!item && <FleetInventory model={model} origin={origin} />}
    </section>
  )
}
