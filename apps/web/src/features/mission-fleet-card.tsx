import { useId, useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentServerTime,
  pendingCommand,
} from '../client-model/game-projection'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { Button } from '../ui/button'
import { Link } from '../ui/link'
import { useRowLink } from '../ui/use-row-link'
import { Heading, Text } from '../ui/typography'
import { NumberValue, ResourceQuantity } from '../ui/number-value'
import { formatWholeNumber } from '../ui/whole-number'
import { CoordinateLink } from './coordinate-link'
import { ShipComposition } from './ship-composition'
import { FleetCargo } from './fleet-cargo'
import { FleetFlightRoute } from './fleet-flight-route'
import {
  fleetShipCount,
  ownFleetSummary,
  ownFleetTone,
} from './command-hud/fleet-summary'
import { MissionTrajectory } from './mission-trajectory'
import {
  exactTime,
  recallEstimate,
  missionLocation,
} from './mission-presentation'
import styles from './missions.module.css'
import fleetStyles from './mission-fleets.module.css'
type S = components['schemas']

export function FleetRecall({
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
    <div
      className={fleetStyles.recall}
      data-reviewing={(reviewing && !pending) || undefined}
    >
      {reviewing && !pending ? (
        <section
          aria-label="Review recall"
          className={fleetStyles.recallReview}
        >
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
          variant="ghost"
          size="small"
          padding="compact"
          className={fleetStyles.recallButton}
          disabled={pending}
          onClick={() => setReviewing(true)}
        >
          <RotateCcw size={13} aria-hidden="true" />
          {pending ? 'Recall requested' : 'Review recall'}
        </Button>
      )}
      {pending && (
        <Text>Recall requested · confirming the return journey.</Text>
      )}
    </div>
  )
}

export function MissionFleetCard({
  model,
  view,
  fleet,
  detail,
  origin,
  as: Container = 'article',
  linkEnabled = true,
}: {
  model: Coordinator
  view: S['BoundView4']
  fleet: S['OwnMission4']
  detail: boolean
  origin: string
  as?: 'article' | 'li'
  linkEnabled?: boolean
}) {
  const universeName = useUniverseName()
  const state = useStore(model.store)
  const now = currentServerTime(state)
  const [showShips, setShowShips] = useState(detail)
  const shipsId = useId()
  const { linkRef, rowProps } = useRowLink(!detail && linkEnabled)
  const row = ownFleetSummary(view, fleet)
  const count = fleetShipCount(fleet.ships)
  return (
    <Container
      {...rowProps}
      className={fleetStyles.card}
      data-flight-tone={ownFleetTone(fleet.intent.mission)}
      aria-label={`${fleet.intent.mission} fleet`}
    >
      <header className={fleetStyles.heading}>
        <Heading
          level={3}
          className={fleetStyles.title}
          aria-label={`${fleet.intent.mission} ${fleet.leg}`}
        >
          {!detail && linkEnabled ? (
            <Link
              ref={linkRef}
              className={fleetStyles.rowLink}
              {...routeTarget(universeName, 'fleets', origin, fleet.id)}
              aria-label={`View ${fleet.intent.mission} ${fleet.leg.toLowerCase()} fleet`}
            >
              {fleet.intent.mission}
            </Link>
          ) : (
            fleet.intent.mission
          )}{' '}
          <span>{fleet.leg}</span>
        </Heading>
        <Button
          variant="ghost"
          padding="compact"
          className={fleetStyles.manifestToggle}
          aria-expanded={showShips}
          aria-controls={shipsId}
          aria-label={`${fleet.intent.mission} ship composition: ${formatWholeNumber(count)} ${count === 1n ? 'ship' : 'ships'}`}
          onClick={() => setShowShips(!showShips)}
        >
          <NumberValue value={count} /> {count === 1n ? 'ship' : 'ships'}
          <ChevronDown size={12} aria-hidden="true" />
        </Button>
      </header>
      <div className={fleetStyles.flight} title={exactTime(fleet.due_at)}>
        <FleetFlightRoute row={row} now={now} />
      </div>
      <FleetCargo cargo={fleet.cargo} />
      <div id={shipsId} hidden={!showShips} className={fleetStyles.manifest}>
        <ShipComposition ships={fleet.ships} />
        <p className={fleetStyles.exactArrival}>
          {fleet.leg === 'Returning' ? 'Return' : 'Arrival'}:{' '}
          <time dateTime={new Date(fleet.due_at).toISOString()}>
            {exactTime(fleet.due_at)}
          </time>
        </p>
        <div className={fleetStyles.coordinateActions}>
          <CoordinateLink
            at={fleet.origin}
            target={
              view.bodies.find((b) => b.id === fleet.intent.origin)?.kind ===
              'Moon'
                ? 'moon'
                : 'planet'
            }
            label="origin"
          >
            {missionLocation(view, fleet.intent.origin, fleet.origin)}
          </CoordinateLink>{' '}
          <span
            className={fleetStyles.direction}
            role="img"
            aria-label={
              fleet.leg === 'Returning'
                ? 'Returning to origin'
                : 'Travelling to destination'
            }
          >
            {fleet.leg === 'Returning' ? '←' : '→'}
          </span>{' '}
          <CoordinateLink
            at={fleet.destination}
            target={
              fleet.intent.destination.type === 'Body' &&
              fleet.intent.destination.expected_kind === 'Moon'
                ? 'moon'
                : fleet.intent.destination.type === 'Debris'
                  ? 'debris'
                  : 'planet'
            }
            label="destination"
          >
            {missionLocation(
              view,
              fleet.intent.destination.type === 'Body'
                ? fleet.intent.destination.id
                : undefined,
              fleet.destination,
            )}
          </CoordinateLink>
        </div>
      </div>
      <div className={fleetStyles.actions}>
        {(fleet.can_recall ||
          pendingCommand(state, {
            type: 'World',
            action: { type: 'RecallMission', fleet: fleet.id },
          })) && <FleetRecall model={model} fleetId={fleet.id} fleet={fleet} />}
      </div>
      {detail && (
        <>
          <div className={styles.fuel}>
            <span>
              Fuel spent{' '}
              <strong>
                <ResourceQuantity
                  resource={'deuterium'}
                  value={fleet.paid_fuel}
                />{' '}
                deuterium
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
    </Container>
  )
}
