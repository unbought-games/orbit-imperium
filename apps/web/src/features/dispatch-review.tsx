import { useProfileSource } from '../shell/player-profiles-context'
import {
  ArrowRight,
  Globe2,
  Eye,
  Flag,
  Package,
  Recycle,
  Swords,
} from 'lucide-react'
import type { Ref } from 'react'
import type { components } from '../contracts'
import { flightDuration, flightSchedule } from '../client-model/dispatch-timing'
import { bodyName } from '../ui/format'
import { Button } from '../ui/button'
import { Heading, Text } from '../ui/typography'
import {
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
import { FleetSlots } from './fleet-slots'
import { ShipComposition } from './ship-composition'
import styles from './missions.module.css'
type S = components['schemas']
const missionIcons = {
  Attack: Swords,
  Transport: Package,
  Deploy: Flag,
  Espionage: Eye,
  Harvest: Recycle,
  Colonize: Globe2,
}

export function DispatchReview({
  quote,
  body,
  view,
  target,
  playerNames,
  coordinates,
  occupiedSlots,
  now,
  observedAt,
  colonyWarning,
  disabled,
  panelRef,
  onEdit,
  onSend,
}: {
  quote: S['FleetTerms4']
  body: S['BodyV3']
  view: S['BoundView4']
  target?: DispatchTarget
  playerNames?: S['PublicPlayerNames4']
  coordinates: S['Coordinates']
  occupiedSlots: number
  now: number
  observedAt?: number
  colonyWarning?: string | null
  disabled: boolean
  panelRef: Ref<HTMLElement>
  onEdit: () => void
  onSend: () => void
}) {
  const mission = quote.intent.mission
  const Icon = missionIcons[mission]
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
  return (
    <QuotePanel
      as="section"
      aria-label="Fleet quote"
      tabIndex={-1}
      ref={panelRef}
      className={styles.review}
    >
      <div className={styles.actions}>
        <Heading level={2} className={styles.reviewHeading}>
          <span>Review dispatch:</span>{' '}
          <strong data-mission={mission}>
            <Icon aria-hidden="true" />
            {mission}
          </strong>
        </Heading>
        <Button type="button" variant="secondary" onClick={onEdit}>
          Edit mission
        </Button>
      </div>
      <div className={styles.reviewRoute} aria-label="Flight route">
        <div>
          <strong>{bodyName(body)}</strong>
          <CoordinateLink
            at={body.coordinates}
            label="origin"
            target={body.kind === 'Moon' ? 'moon' : 'planet'}
            known={{ owner: view.binding.player }}
          />
          <span>
            <PlayerName
              player={view.binding.player}
              names={view.player_names}
            />
          </span>
        </div>
        <ArrowRight aria-label="to" role="img" className={styles.reviewArrow} />
        <div>
          <strong>{destination.name}</strong>
          <CoordinateLink
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
      <dl className={styles.reviewFacts}>
        <div className={styles.reviewWide}>
          <dt>Ships</dt>
          <dd>
            <ShipComposition ships={quote.intent.ships} />
          </dd>
        </div>
        <div className={styles.reviewWide}>
          <dt>
            Cargo{' '}
            <span>
              · Payload capacity{' '}
              <ResourceNumber value={quote.maximum_payload} /> after fuel
            </span>
          </dt>
          <dd>
            <ResourceSummary value={quote.intent.cargo} />
          </dd>
        </div>
        <div>
          <dt>One-way flight</dt>
          <dd>
            {flightDuration(quote.duration_ms)}{' '}
            <small>at {quote.intent.speed_percent}% speed</small>
          </dd>
        </div>
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
      {mission === 'Colonize' && colonyWarning && (
        <Text role="status">{colonyWarning}</Text>
      )}
      <Text className={styles.reviewNote}>
        <FleetSlots used={occupiedSlots} total={quote.slot_limit} />
      </Text>
      <QuoteAction disabled={disabled} onClick={onSend}>
        {dispatchSendLabel(quote.intent, destination)}
      </QuoteAction>
      <details className={styles.reviewDetails}>
        <summary>
          Flight details
          {observedAt !== undefined ? ' · historical observation' : ''}
        </summary>
        <Text>
          Estimates assume departure now. Fuel is spent once and is not refunded
          on recall. Total capacity before fuel:{' '}
          <ResourceNumber value={quote.capacity} />. Returning fleets occupy a
          slot.
        </Text>
        {mission === 'Espionage' && <Text>Probes carry fuel only.</Text>}
        {observedAt !== undefined && (
          <Text>
            Prepared from an observation at {exactTime(observedAt)}. This is
            historical information; review checks the current destination and
            mission eligibility.
          </Text>
        )}
      </details>
    </QuotePanel>
  )
}
