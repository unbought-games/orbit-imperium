import { playerLabel } from './player-label'
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
import { coordinates } from '../ui/format'
import { MissionTrajectory } from './mission-trajectory'
import {
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
            <Button variant="quiet" onClick={() => setReviewing(false)}>
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
          variant="quiet"
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
  const now = currentServerTime(state)
  const fleets = view.missions.fleets.filter(
    (fleet) => !item || fleet.id === item,
  )
  const launches = pendingFleetLaunches(state)
  const body = view.bodies.find((entry) => entry.id === origin)
  return (
    <section className={styles.screen}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Fleet command</p>
        <Heading level={2} className={styles.title}>
          Your reach, in motion.
        </Heading>
        <Text>Follow your missions. Prepare the next departure.</Text>
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
      </header>
      {!fleets.length && !launches.length && (
        <div className={styles.empty}>
          {body && (
            <MissionTrajectory
              origin={body.coordinates}
              originIdentity={body}
            />
          )}
          <Heading level={3}>No active fleets.</Heading>
          <Text>
            Prepare a mission from the ships stationed at your worlds.
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
          <MissionTrajectory
            origin={fleet.origin}
            originIdentity={view.bodies.find(
              (body) => body.id === fleet.intent.origin,
            )}
            destinationIdentity={
              fleet.intent.destination.type === 'Body'
                ? {
                    id: fleet.intent.destination.id,
                    kind: fleet.intent.destination.expected_kind,
                  }
                : {
                    id: fleet.intent.destination.field_identity,
                    kind: 'Debris',
                  }
            }
            destination={fleet.destination}
            returning={fleet.leg === 'Returning'}
          />
          <div className={styles.missionFacts}>
            <div>
              <Heading level={3} className={styles.missionTitle}>
                {fleet.intent.mission} · {fleet.leg}
              </Heading>
              <Text>{shipManifest(fleet.ships)}</Text>
              <Text>
                {coordinates({ coordinates: fleet.origin })}{' '}
                {fleet.leg === 'Returning' ? '←' : '→'}{' '}
                {coordinates({ coordinates: fleet.destination })}
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
        </article>
      ))}
      <section className={styles.incoming} aria-label="Incoming fleets">
        <Heading level={2}>Incoming fleets</Heading>
        {!view.missions.incoming.length && (
          <Text>No visible incoming fleets.</Text>
        )}
        {view.missions.incoming.map((fleet, index) => (
          <article className={styles.incomingRow} key={index}>
            <div>
              <Heading level={3}>
                {fleet.mission} · {playerLabel(fleet.sender, view.player_names)}
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
