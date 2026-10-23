import { PlayerName } from './player-name'
import { useProfileSource } from '../shell/player-profiles-context'
import { useUniverseName } from '../shell/session-context'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { useState } from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentServerTime,
  pendingCommand,
  occupiedFleetSlots,
  pendingFleetLaunches,
} from '../client-model/game-projection'
import { Button, ButtonLink } from '../ui/button'
import { Link } from '../ui/link'
import { Heading, Text } from '../ui/typography'
import { routeTarget } from '../shell/route-target'
import { TaskHeader } from '../ui/task-header'
import { MissionTrajectory } from './mission-trajectory'
import {
  missionLocation,
  arrivalCountdown,
  exactTime,
  incomingManifest,
  recallEstimate,
  shipManifest,
} from './mission-presentation'
import styles from './missions.module.css'
type S = components['schemas']

function Recall({
  model,
  fleetId,
  fleet,
}: {
  model: Coordinator
  fleetId: string
  fleet?: S['OwnMission4']
}) {
  const [reviewing, setReviewing] = useState(false)
  const state = useStore(model.store)
  const command = {
    type: 'World',
    action: { type: 'RecallMission', fleet: fleetId },
  } as const
  const pending = pendingCommand(state, command)
  const estimate = fleet
    ? recallEstimate(fleet, currentServerTime(state))
    : null
  return (
    <div className={styles.recall}>
      {reviewing && !pending ? (
        <section aria-label="Review recall" className={styles.recallReview}>
          <Heading level={3}>Review recall</Heading>
          <Text>
            Fuel is not refunded. Surviving ships and carried cargo return to
            their origin.
          </Text>
          <Text>
            {estimate !== null
              ? `Estimated return if recalled now: ${exactTime(estimate)}. The return leg equals time already travelled.`
              : 'The server will confirm the return time when it accepts recall.'}{' '}
            Arrival may resolve before a recall reaches the server.
          </Text>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Keep mission
            </Button>
            <Button
              disabled={pending || fleet?.can_recall === false}
              onClick={() => {
                void model.send(command)
                setReviewing(false)
              }}
            >
              Recall fleet
            </Button>
          </div>
        </section>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setReviewing(true)}
        >
          {pending ? 'Recall requested' : 'Review recall'}
        </Button>
      )}
      {pending && (
        <Text>Recall requested · confirming the return journey.</Text>
      )}
    </div>
  )
}

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
  const fleets = view.missions.fleets.filter(
    (fleet) => !item || fleet.id === item,
  )
  const launches = pendingFleetLaunches(state).filter(
    (launch) => !item || launch.fleetId === item,
  )
  return (
    <section className={styles.screen}>
      <TaskHeader title={item ? 'Mission details' : 'Fleets'}>
        <div className={styles.actions}>
          {item && (
            <Link {...routeTarget(universeName, 'fleets', origin)}>
              All fleets
            </Link>
          )}
          <ButtonLink {...routeTarget(universeName, 'dispatch', origin)}>
            Dispatch a fleet
          </ButtonLink>
          <span>
            Fleet slots: {occupiedFleetSlots(state)} /{' '}
            {view.missions.fleet_slots}
          </span>
        </div>
      </TaskHeader>
      {!fleets.length && !launches.length && (
        <div className={styles.empty}>
          <Heading level={3}>
            {item ? 'Fleet unavailable.' : 'No active fleets.'}
          </Heading>
          <Text>
            {item
              ? 'This mission may have completed. Check reports for its outcome.'
              : 'Prepare a mission from the ships stationed at your worlds.'}
          </Text>
        </div>
      )}
      {launches.map(({ attempt, fleetId, canRecall, recalling }) => (
        <article className={styles.fleet} key={attempt.envelope.command_id}>
          <Heading level={3}>Fleet dispatch in progress</Heading>
          <Text>
            {attempt.status === 'uncertain'
              ? 'Awaiting launch confirmation. Reserved ships and cargo will reconcile with the server.'
              : 'Departure order accepted; awaiting the game result.'}
          </Text>
          {fleetId && canRecall && <Recall model={model} fleetId={fleetId} />}
          {recalling && (
            <Text>Recall requested · awaiting the game result.</Text>
          )}
        </article>
      ))}
      {fleets.map((fleet) => (
        <article
          className={styles.fleet}
          key={fleet.id}
          aria-label={`${fleet.intent.mission} fleet`}
        >
          <div className={styles.missionFacts}>
            <div>
              <Heading level={3} className={styles.missionTitle}>
                {fleet.intent.mission} · {fleet.leg}
              </Heading>
              <Text>{shipManifest(fleet.ships)}</Text>
              <Text>
                {missionLocation(view, fleet.intent.origin, fleet.origin)}{' '}
                {fleet.leg === 'Returning' ? '←' : '→'}{' '}
                {missionLocation(
                  view,
                  fleet.intent.destination.type === 'Body'
                    ? fleet.intent.destination.id
                    : undefined,
                  fleet.destination,
                )}
              </Text>
            </div>
            <div className={styles.arrival}>
              <span>
                {fleet.leg === 'Returning' ? 'Return in' : 'Arrival in'}
              </span>
              <strong>{arrivalCountdown(fleet.due_at, now)}</strong>
              <time dateTime={new Date(fleet.due_at).toISOString()}>
                {exactTime(fleet.due_at)}
              </time>
            </div>
          </div>
          <div className={styles.actions}>
            {(fleet.can_recall ||
              pendingCommand(state, {
                type: 'World',
                action: { type: 'RecallMission', fleet: fleet.id },
              })) && <Recall model={model} fleetId={fleet.id} fleet={fleet} />}
            {!item && (
              <Link {...routeTarget(universeName, 'fleets', origin, fleet.id)}>
                Mission details
              </Link>
            )}
          </div>
          {item && (
            <>
              <dl className={styles.cargo}>
                {(['metal', 'crystal', 'deuterium'] as const).map((key) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      <ResourceNumber value={fleet.cargo[key]} />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className={styles.fuel}>
                <span>
                  Fuel spent{' '}
                  <strong>
                    <ResourceNumber value={fleet.paid_fuel} /> deuterium
                  </strong>
                </span>
                <span>
                  Speed <strong>{fleet.intent.speed_percent}%</strong>
                </span>
              </div>
              <details className={styles.rules}>
                <summary>Flight path</summary>
                <MissionTrajectory
                  origin={fleet.origin}
                  originIdentity={view.bodies.find(
                    (body) => body.id === fleet.intent.origin,
                  )}
                  destinationIdentity={
                    fleet.intent.destination.type === 'Body'
                      ? {
                          id: fleet.intent.destination.id,
                          name: [...view.bodies, ...view.destinations].find(
                            (body) =>
                              fleet.intent.destination.type === 'Body' &&
                              body.id === fleet.intent.destination.id,
                          )?.name,
                          kind: fleet.intent.destination.expected_kind,
                        }
                      : fleet.intent.destination.type === 'Debris'
                        ? {
                            id: fleet.intent.destination.field_identity,
                            kind: 'Debris',
                          }
                        : undefined
                  }
                  destination={fleet.destination}
                  returning={fleet.leg === 'Returning'}
                />
              </details>
            </>
          )}
        </article>
      ))}
      {!item && (
        <section className={styles.incoming} aria-label="Incoming fleets">
          <Heading level={2}>Incoming fleets</Heading>
          {!view.missions.incoming.length && (
            <Text>No visible incoming fleets.</Text>
          )}
          {view.missions.incoming.map((fleet, index) => (
            <article className={styles.incomingRow} key={index}>
              <div>
                <Heading level={3}>
                  {fleet.mission} ·{' '}
                  <PlayerName player={fleet.sender} names={view.player_names} />
                </Heading>
                <Text>{incomingManifest(fleet.ships)}</Text>
              </div>
              <div>
                <strong>{arrivalCountdown(fleet.arrival_at, now)}</strong>
                <time dateTime={new Date(fleet.arrival_at).toISOString()}>
                  {exactTime(fleet.arrival_at)}
                </time>
              </div>
            </article>
          ))}
        </section>
      )}
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
