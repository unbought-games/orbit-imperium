import { useProfileSource } from '../shell/player-profiles-context'
import { missionOptions } from './mission-options'
import type { Ref } from 'react'
import type { components } from '../contracts'
import { flightDuration, flightSchedule } from '../client-model/dispatch-timing'
import { bodyName } from '../ui/format'
import { Heading, Text } from '../ui/typography'
import {
  NumberValue,
  ResourceNumber,
  ResourceQuantity,
  ResourceSummary,
} from '../ui/number-value'
import { QuoteAction, QuotePanel } from '../ui/quote-panel'
import { CoordinateLink } from './coordinate-link'
import { PlayerName } from './player-name'
import { exactTime } from './mission-presentation'
import {
  dispatchSendLabel,
  missionReturn,
  reviewDestination,
  type DispatchTarget,
} from './dispatch-review-model'
import { FleetRouteTrack } from './fleet-flight-route'
import { fleetShipCount } from './command-hud/fleet-summary'
import { ShipComposition } from './ship-composition'
import styles from './missions.module.css'
type S = components['schemas']

export function DispatchReview({
  quote,
  body,
  view,
  target,
  playerNames,
  coordinates,
  now,
  observedAt,
  colonyWarning,
  disabled,
  panelRef,
  onSend,
}: {
  quote: S['FleetTerms4']
  body: S['BodyV3']
  view: S['BoundView4']
  target?: DispatchTarget
  playerNames?: S['PublicPlayerNames4']
  coordinates: S['Coordinates']
  now: number
  observedAt?: number
  colonyWarning?: string | null
  disabled: boolean
  panelRef: Ref<HTMLElement>
  onSend: () => void
}) {
  const mission = quote.intent.mission
  const Icon = missionOptions[mission].icon
  const destination = reviewDestination(
    quote.intent.destination,
    coordinates,
    target,
  )
  useProfileSource(
    destination.owner
      ? { type: 'Rankings', players: [destination.owner] }
      : null,
  )

  const schedule = flightSchedule(quote.duration_ms, now, mission)
  const returning = missionReturn[mission]
  const shipCount = fleetShipCount(quote.intent.ships)
  return (
    <QuotePanel
      as="section"
      aria-label="Fleet quote"
      tabIndex={-1}
      ref={panelRef}
      className={styles.review}
    >
      <div className={styles.reviewSummary}>
        <Heading level={2} className={styles.reviewHeading}>
          <strong data-mission={mission}>
            <Icon aria-hidden="true" />
            {mission}
          </strong>
        </Heading>
        <span>
          <NumberValue value={shipCount} />{' '}
          {shipCount === 1n ? 'ship' : 'ships'}
        </span>
      </div>
      <div className={styles.reviewRoute} aria-label="Flight route">
        <FleetRouteTrack
          home={{ kind: body.kind, art: body }}
          target={
            quote.intent.destination.type === 'Body'
              ? {
                  kind: quote.intent.destination.expected_kind,
                  art: {
                    id: quote.intent.destination.id,
                    kind: quote.intent.destination.expected_kind,
                    coordinates: destination.coordinates,
                  },
                }
              : { kind: quote.intent.destination.type }
          }
          label={`Planned flight from ${bodyName(body)} to ${destination.name}`}
        />
        <div className={styles.reviewEndpoints}>
          <div>
            <strong>{bodyName(body)}</strong>
            <CoordinateLink
              compact
              at={body.coordinates}
              label="origin"
              target={body.kind === 'Moon' ? 'moon' : 'planet'}
              known={{ owner: view.binding.player }}
            />
            <span>
              <PlayerName player={view.binding.player} fallback="You" />
            </span>
          </div>
          <div className={styles.reviewDuration}>
            <span>One-way flight</span>
            <strong>{flightDuration(quote.duration_ms)}</strong>
            <small>at {quote.intent.speed_percent}% speed</small>
          </div>
          <div>
            <strong>{destination.name}</strong>
            <CoordinateLink
              compact
              at={destination.coordinates}
              label="destination"
              target={destination.kind}
              known={{
                owner: destination.owner,
                empty: quote.intent.destination.type === 'EmptyPosition',
                debris: destination.kind === 'debris',
              }}
            />
            <span>
              {destination.owner ? (
                <PlayerName player={destination.owner} names={playerNames} />
              ) : (
                'Unowned'
              )}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.reviewGroups}>
        <section aria-label="Fleet and cargo">
          <Heading level={3} className={styles.reviewGroupHeading}>
            Fleet &amp; cargo
          </Heading>
          <dl className={styles.reviewFacts}>
            <div>
              <dt>Ships</dt>
              <dd className={styles.reviewManifest}>
                <ShipComposition ships={quote.intent.ships} />
              </dd>
            </div>
            <div>
              <dt>Cargo</dt>
              <dd className={styles.reviewCargo}>
                <ResourceSummary value={quote.intent.cargo} layout="stacked" />
                <small>
                  Payload capacity{' '}
                  <ResourceNumber value={quote.maximum_payload} /> after fuel
                </small>
              </dd>
            </div>
          </dl>
        </section>
        <section aria-label="Flight schedule">
          <Heading level={3} className={styles.reviewGroupHeading}>
            Flight schedule
          </Heading>
          <dl className={styles.reviewFacts}>
            <div>
              <dt>Fuel</dt>
              <dd>
                <ResourceQuantity resource="deuterium" value={quote.fuel} />
              </dd>
            </div>
            <div>
              <dt>Estimated arrival</dt>
              <dd>
                <time dateTime={new Date(schedule.arrival).toISOString()}>
                  {exactTime(schedule.arrival)}
                </time>
              </dd>
            </div>
            <div>
              <dt>{returning.label}</dt>
              <dd>
                {schedule.returnAt === null ? (
                  'One-way deployment'
                ) : (
                  <time dateTime={new Date(schedule.returnAt).toISOString()}>
                    {exactTime(schedule.returnAt)}
                  </time>
                )}
              </dd>
            </div>
          </dl>
          <Text className={styles.reviewNote}>{returning.note}</Text>
        </section>
      </div>
      {mission === 'Colonize' && colonyWarning && (
        <Text role="status">{colonyWarning}</Text>
      )}
      {mission === 'Espionage' && (
        <Text className={styles.reviewNote}>Probes carry fuel only.</Text>
      )}
      {observedAt !== undefined && (
        <Text className={styles.reviewNote}>
          Prepared from an observation at {exactTime(observedAt)}. This is
          historical information; review checks the current destination and
          mission eligibility.
        </Text>
      )}
      <QuoteAction disabled={disabled} onClick={onSend}>
        {dispatchSendLabel(quote.intent, destination)}
      </QuoteAction>
    </QuotePanel>
  )
}
