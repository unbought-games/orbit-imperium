import { CoordinateLink } from './coordinate-link'
import {
  LocationSummary,
  LocationSummaryMedia,
  LocationSummaryContent,
  LocationSummaryTitle,
  LocationSummaryDescription,
} from '../ui/location-summary'
import { useRef } from 'react'
import { Radar } from 'lucide-react'
import type { components } from '../contracts'
import type { LocationKind } from '../shell/location-address'
import { BodyIllustration } from './body-illustration'
import { CoordinateInput } from '../ui/coordinate-input'
import { RichSelect } from '../ui/rich-select'
import { coordinateText } from '../shell/location-address'
import { bodyName } from '../ui/format'
import { playerLabel, type PlayerNames } from './player-label'
import type { destinationBody } from './dispatch-destination'
import styles from './missions.module.css'

export function DispatchDestinationPreview({
  coordinates,
  readOnly = false,
  kind,
  target,
  lookup,
  player,
  playerNames,
  value,
  universe,
  error,
  bodies,
  selectedBody,
  onChange,
  onSelectBody,
}: {
  readOnly?: boolean
  coordinates: components['schemas']['Coordinates'] | null
  kind: LocationKind
  target: ReturnType<typeof destinationBody>
  lookup: 'loading' | 'ready' | 'unavailable'
  player: string
  playerNames: PlayerNames
  value: string
  universe: string
  error?: string
  bodies?: components['schemas']['BodyV3'][]
  selectedBody?: string
  onChange: (text: string, kind?: LocationKind) => void
  onSelectBody: (id: string) => void
}) {
  const field = useRef<HTMLDivElement>(null)
  const title = !coordinates
    ? value.trim()
      ? 'Complete your destination'
      : 'Where are we heading?'
    : kind === 'debris'
      ? 'Debris field'
      : target
        ? target.name || target.kind
        : lookup === 'loading'
          ? 'Looking up destination…'
          : lookup === 'unavailable'
            ? 'Destination unavailable'
            : kind === 'moon'
              ? 'Moon unavailable'
              : 'Empty position'
  const detail = !coordinates
    ? 'Enter valid coordinates or choose one of your planets or moons.'
    : target
      ? `${target.kind} · ${target.owner === player ? (target.source === 'empire' ? (target.kind === 'Moon' ? 'Your moon' : target.homeworld ? 'Your Homeworld' : target.colony ? 'Your colony' : 'Your planet') : 'Last known owner: you') : playerLabel(target.owner, playerNames)}`
      : kind === 'debris'
        ? lookup === 'loading'
          ? 'Checking for salvage…'
          : lookup === 'unavailable'
            ? 'Salvage unknown. Review will check again.'
            : 'Debris field selected.'
        : lookup === 'loading'
          ? 'Checking destination.'
          : lookup === 'unavailable'
            ? 'System lookup failed. Review will check the destination again.'
            : kind === 'moon'
              ? 'Review verifies whether a moon is available here.'
              : 'No planet at these coordinates.'
  return (
    <LocationSummary
      ref={field}
      className={styles.destinationPreview}
      aria-label="Destination preview"
    >
      <LocationSummaryMedia aria-hidden="true">
        {target && coordinates ? (
          <BodyIllustration
            body={{ ...target, coordinates }}
            className={styles.destinationWorld}
            sizes="80px"
          />
        ) : kind === 'debris' && coordinates ? (
          <img
            src="/art/debris/debris-medium.webp"
            className={styles.destinationWorld}
            width={80}
            height={80}
            alt=""
          />
        ) : (
          <Radar />
        )}
      </LocationSummaryMedia>
      <LocationSummaryContent>
        {bodies ? (
          <RichSelect
            label="Your planets and moons"
            anchor={field}
            title={
              bodies.length
                ? 'Choose one of your planets or moons'
                : 'No other destinations yet. Enter destination coordinates.'
            }
            value={selectedBody}
            disabled={!bodies.length}
            className={styles.destinationChooser}
            popupClassName={styles.destinationOptions}
            onValueChange={onSelectBody}
            options={bodies.map((planet) => ({
              value: planet.id,
              label: `${bodyName(planet)} · ${planet.kind} [${coordinateText(planet.coordinates)}]`,
              content: (
                <span className={styles.destinationOption}>
                  <BodyIllustration
                    body={planet}
                    className={styles.destinationOptionArt}
                    sizes="40px"
                  />
                  <span>
                    <strong>{bodyName(planet)}</strong>
                    <small>
                      {planet.kind} · [{coordinateText(planet.coordinates)}]
                    </small>
                  </span>
                </span>
              ),
            }))}
          >
            <LocationSummaryTitle
              title={title}
              className={styles.destinationName}
            >
              {title}
            </LocationSummaryTitle>
          </RichSelect>
        ) : (
          <LocationSummaryTitle
            title={title}
            className={styles.destinationName}
          >
            {title}
          </LocationSummaryTitle>
        )}
        <LocationSummaryDescription aria-live="polite" aria-atomic="true">
          <span className={styles.destinationAnnouncement}>{title}. </span>
          {detail}
        </LocationSummaryDescription>
        {readOnly && coordinates ? (
          <CoordinateLink at={coordinates} label="group target" />
        ) : (
          <CoordinateInput
            embedded
            value={value}
            universe={universe}
            error={error}
            onChange={onChange}
          />
        )}
      </LocationSummaryContent>
    </LocationSummary>
  )
}
