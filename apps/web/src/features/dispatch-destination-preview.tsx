import { useRef } from 'react'
import { Orbit, Radar } from 'lucide-react'
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
  kind,
  target,
  lookup,
  refreshing,
  player,
  playerNames,
  value,
  universe,
  error,
  planets,
  selectedPlanet,
  onChange,
  onSelectPlanet,
}: {
  coordinates: components['schemas']['Coordinates'] | null
  kind: LocationKind
  target: ReturnType<typeof destinationBody>
  lookup: 'loading' | 'ready' | 'unavailable'
  refreshing: boolean
  player: string
  playerNames: PlayerNames
  value: string
  universe: string
  error?: string
  planets?: components['schemas']['BodyV3'][]
  selectedPlanet?: string
  onChange: (text: string, kind?: LocationKind) => void
  onSelectPlanet: (id: string) => void
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
              ? 'Moon not observed'
              : 'Empty position'
  const detail = !coordinates
    ? 'Enter valid coordinates or choose one of your planets.'
    : target
      ? `${target.kind} · ${target.owner === player ? (target.source === 'empire' ? (target.kind === 'Moon' ? 'Your moon' : target.homeworld ? 'Your Homeworld' : target.colony ? 'Your colony' : 'Your planet') : 'You (last observed)') : playerLabel(target.owner, playerNames)}`
      : kind === 'debris'
        ? lookup === 'loading'
          ? 'Checking for salvage…'
          : lookup === 'unavailable'
            ? 'Salvage unknown. Review will check again.'
            : 'System observation checked. Review verifies current salvage.'
        : lookup === 'loading'
          ? 'Checking the current system observation.'
          : lookup === 'unavailable'
            ? 'System lookup failed. Review will check the destination again.'
            : kind === 'moon'
              ? 'Review verifies whether a moon is available here.'
              : 'No planet in the current system observation.'
  return (
    <div
      ref={field}
      className={styles.destinationPreview}
      aria-label="Destination preview"
    >
      <div className={styles.destinationArt} aria-hidden="true">
        {target && coordinates ? (
          <BodyIllustration
            body={{ ...target, coordinates }}
            className={styles.destinationWorld}
            sizes="80px"
          />
        ) : kind === 'debris' && coordinates ? (
          <Orbit />
        ) : (
          <Radar />
        )}
      </div>
      <div className={styles.destinationIdentity}>
        {planets ? (
          <RichSelect
            label="Your other planets"
            anchor={field}
            title={
              planets.length
                ? 'Choose one of your planets'
                : 'No other planets yet. Enter destination coordinates.'
            }
            value={selectedPlanet}
            disabled={!planets.length}
            className={styles.destinationChooser}
            popupClassName={styles.destinationOptions}
            onValueChange={onSelectPlanet}
            options={planets.map((planet) => ({
              value: planet.id,
              label: `${bodyName(planet)} [${coordinateText(planet.coordinates)}]`,
              content: (
                <span className={styles.destinationOption}>
                  <BodyIllustration
                    body={planet}
                    className={styles.destinationOptionArt}
                    sizes="40px"
                  />
                  <span>
                    <strong>{bodyName(planet)}</strong>
                    <small>[{coordinateText(planet.coordinates)}]</small>
                  </span>
                </span>
              ),
            }))}
          >
            <strong title={title} className={styles.destinationName}>
              {title}
            </strong>
          </RichSelect>
        ) : (
          <strong title={title} className={styles.destinationName}>
            {title}
          </strong>
        )}
        <span
          className={styles.destinationDetail}
          aria-live="polite"
          aria-atomic="true"
        >
          <span className={styles.destinationAnnouncement}>{title}. </span>
          {detail}
          {refreshing && ' · Last observation · Updating…'}
        </span>
        <CoordinateInput
          embedded
          value={value}
          universe={universe}
          error={error}
          onChange={onChange}
        />
      </div>
    </div>
  )
}
