import { probePreferenceReason } from '../client-model/player-preferences'
import { usePlayerPreferences } from '../shell/player-preferences-context'
import { PhalanxAction } from './phalanx-action'
import { publicMoonBody } from './galaxy-body'
import { useProfileSource } from '../shell/player-profiles-context'
import { PlayerName } from './player-name'
import { playerLabel } from './player-label'
import { Button } from '../ui/button'
import { GalaxyNavigation } from './galaxy-navigation'
import styles from './galaxy.module.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { galaxyTarget } from '../shell/galaxy-location'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { DispatchDraft } from './missions'
import { GalaxyHarvestAction } from './galaxy-harvest-action'
import { MissileLaunchAction } from './missile-launch-action'
import { GalaxyPosition } from './galaxy-position'
import { galaxyMissionCapabilities } from './galaxy-mission-actions'
import { colonizationStatus } from '../client-model/colonization'
import { FleetSlots } from './fleet-slots'
import {
  currentServerTime,
  occupiedFleetSlots,
} from '../client-model/game-projection'
import { galaxyFlights } from '../client-model/galaxy-fleets'
import { useGalaxyEspionage } from './use-galaxy-espionage'
import { BodyAppearanceContext } from './body-appearance'
import { useTutorial } from './tutorial/use-tutorial'
import { GalaxySite } from './tutorial/galaxy-sites'
import { sitesAtPosition, siteLocation } from './tutorial/galaxy-sites-model'
type System = components['schemas']['GalaxySystem4']
export function Galaxy({
  model,
  universe,
  origin,
  onDraft,
}: {
  model: Coordinator
  universe: string
  origin: string
  onDraft: (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
    targetKind?: DispatchDraft['targetKind'],
  ) => void
}) {
  const preferences = usePlayerPreferences()
  const probeCount = preferences.preferences?.galaxy_probe_count
  const preferenceReason = probePreferenceReason(preferences)
  const espionage = useGalaxyEspionage(
    model,
    origin,
    probeCount ?? '1',
    preferenceReason,
  )
  const tutorial = useTutorial()
  const [harvestSelection, setHarvestSelection] = useState<{
    field: string
    galaxy: number
    system: number
    position: number
    origin: string
    key: number
  } | null>(null)
  const harvestOpener = useRef<HTMLElement | null>(null)
  const [harvestOpen, setHarvestOpen] = useState(false)
  const home = model.view?.bodies.find((b) => b.id === origin)?.coordinates
  const search = useSearch({ strict: false })
  const navigate = useNavigate()
  const galaxy = search.galaxy ?? home?.galaxy ?? 1
  const system = search.system ?? home?.system ?? 1
  const position = search.position
  const valid =
    galaxy <= (model.settings?.galaxies ?? 1) &&
    system <= (model.settings?.systems_per_galaxy ?? 5) &&
    (position === undefined ||
      position <= (model.settings?.positions_per_system ?? 15))
  const browse = (galaxy: number, system: number) =>
    void navigate({
      ...galaxyTarget(universe, origin, { galaxy, system }),
      resetScroll: false,
    })
  const [result, setResult] = useState<{
    data: System | null
    error: string
    loading: boolean
  }>({ data: null, error: '', loading: true })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!valid) return
    let current = true
    // Fleet revisions refresh the current system in place. Only navigation
    // discards its rows, so open actions and keyboard focus survive updates.
    setResult((previous) => ({
      data:
        previous.data?.galaxy === galaxy && previous.data.system === system
          ? previous.data
          : null,
      error: '',
      loading: true,
    }))
    void model
      .world({ type: 'Galaxy', galaxy, system })
      .then((v) => {
        if (current)
          setResult((previous) =>
            v && 'positions' in v
              ? { data: v, error: '', loading: false }
              : {
                  ...previous,
                  error: 'Galaxy unavailable. Try again after reconnecting.',
                  loading: false,
                },
          )
      })
      .catch(() => {
        if (current)
          setResult((previous) => ({
            ...previous,
            error: 'Galaxy unavailable. Try again after reconnecting.',
            loading: false,
          }))
      })
    return () => {
      current = false
    }
  }, [model, galaxy, system, valid, model.view?.viewer_revision, retry])
  // A response for a previous system must never supply actionable rows.
  const data =
    valid && result.data?.galaxy === galaxy && result.data.system === system
      ? result.data
      : null
  const loaded = !!data
  useEffect(() => {
    if (loaded && position !== undefined && !search.site) {
      const target = document.getElementById(`position-${position}`)
      // Focus the destination so the shell's deferred heading scroll cannot
      // hide a position selected within an already loaded system.
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'center' })
    }
  }, [loaded, galaxy, system, position, search.site])
  const harvestPosition =
    harvestSelection?.origin === origin
      ? data?.positions.find(
          (entry) =>
            entry.debris?.field_identity === harvestSelection.field &&
            entry.coordinates.galaxy === harvestSelection.galaxy &&
            entry.coordinates.system === harvestSelection.system &&
            entry.coordinates.position === harvestSelection.position,
        )
      : undefined
  const harvestContextLost =
    !!harvestSelection &&
    (!valid ||
      harvestSelection.origin !== origin ||
      harvestSelection.galaxy !== galaxy ||
      harvestSelection.system !== system ||
      (!!data && !harvestPosition))
  useEffect(() => {
    if (harvestContextLost) {
      // Navigation/depletion ends this interaction; returning must require a
      // new explicit action rather than remounting a previously open form.
      setHarvestOpen(false)
      setHarvestSelection(null)
    }
  }, [harvestContextLost])
  const draft = (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
    opener?: HTMLElement | null,
    targetKind?: DispatchDraft['targetKind'],
  ) => {
    if (mission === 'Harvest') {
      const position = data?.positions.find(
        (entry) =>
          entry.coordinates.position === coordinates.position &&
          entry.coordinates.galaxy === coordinates.galaxy &&
          entry.coordinates.system === coordinates.system,
      )
      if (position?.debris) {
        harvestOpener.current = opener ?? null
        const field = position.debris.field_identity
        setHarvestSelection((previous) => ({
          field,
          ...coordinates,
          origin,
          key: (previous?.key ?? 0) + 1,
        }))
        setHarvestOpen(true)
        return
      }
    }
    onDraft(coordinates, mission, targetKind)
  }
  const missions = galaxyMissionCapabilities(model.view)
  useProfileSource(
    data ? { type: 'Galaxy', galaxy: data.galaxy, system: data.system } : null,
    model.view?.viewer_revision,
  )
  return (
    <section className={styles.screen} aria-label="Galaxy browser">
      <GalaxyNavigation
        galaxy={galaxy}
        system={system}
        galaxies={model.settings?.galaxies ?? 1}
        systems={model.settings?.systems_per_galaxy ?? 5}
        browse={browse}
        fleetSlots={
          espionage.state.view?.protocol === 4 && (
            <FleetSlots
              compact
              className={styles.slots}
              used={occupiedFleetSlots(espionage.state)}
              total={espionage.state.view.missions.fleet_slots}
            />
          )
        }
      />
      {!valid && (
        <p role="alert">These coordinates are outside this universe.</p>
      )}
      {valid && result.error && (
        <div className={styles.error}>
          <p role="alert">{result.error}</p>
          <Button variant="secondary" onClick={() => setRetry((n) => n + 1)}>
            Retry loading galaxy
          </Button>
        </div>
      )}
      {valid && result.loading && !data && (
        <p role="status" className={styles.loading}>
          Loading system…
        </p>
      )}
      {valid && tutorial.error && (
        <div className={tutorial.data ? styles.loading : styles.error}>
          <p role={tutorial.data ? 'status' : 'alert'}>
            {tutorial.data
              ? 'Personal site updates are delayed. Showing the last received information.'
              : 'Personal sites unavailable. Your other Galaxy locations are still available.'}
          </p>
          <Button variant="secondary" onClick={tutorial.retry}>
            Retry personal sites
          </Button>
        </div>
      )}
      {valid &&
        search.site &&
        !tutorial.error &&
        !tutorial.loading &&
        tutorial.data &&
        !tutorial.data.sites.some((site) => {
          const location = siteLocation(site)
          return (
            location.site === search.site &&
            location.galaxy === galaxy &&
            location.system === system &&
            (position === undefined || location.position === position)
          )
        }) && (
          <p role="status">
            This personal site is not available at this location.
          </p>
        )}
      {data && (
        <BodyAppearanceContext.Provider value={data.body_appearances ?? {}}>
          <section className={styles.positions} aria-label="Galaxy positions">
            <ul className={styles.positionList}>
              {data.positions.map((position) => (
                <li
                  id={`position-${position.coordinates.position}`}
                  tabIndex={-1}
                  aria-current={
                    position.coordinates.position === search.position &&
                    !search.site
                      ? 'location'
                      : undefined
                  }
                  className={
                    position.coordinates.position === search.position &&
                    !search.site
                      ? styles.selectedPosition
                      : undefined
                  }
                  key={`${data.galaxy}:${data.system}:${position.coordinates.position}`}
                >
                  {position.coordinates.position === search.position &&
                    !search.site && (
                      <p className={styles.locationLabel}>
                        Selected location [{galaxy}:{system}:{search.position}]
                      </p>
                    )}
                  <GalaxyPosition
                    position={position}
                    scanAction={
                      model.view?.bodies.find((b) => b.id === origin)?.kind ===
                        'Moon' &&
                      position.body?.kind === 'Planet' &&
                      position.body.owner !== model.binding?.player &&
                      model.view?.capabilities.some(
                        (c) => c.capability === 'ScanPlanet' && c.enabled,
                      ) ? (
                        <PhalanxAction
                          key={`${origin}:${position.body.id}`}
                          model={model}
                          origin={origin}
                          position={position}
                          universe={universe}
                        />
                      ) : undefined
                    }
                    missileAction={
                      model.view?.bodies.find((b) => b.id === origin)?.kind ===
                        'Planet' &&
                      position.body &&
                      position.body.owner !== model.binding?.player &&
                      model.view?.capabilities.some(
                        (c) => c.capability === 'Missiles' && c.enabled,
                      )
                        ? (presentation) => (
                            <MissileLaunchAction
                              key={`${origin}:${position.body?.id}:${position.body?.owner}`}
                              model={model}
                              origin={origin}
                              position={position}
                              {...presentation}
                            />
                          )
                        : undefined
                    }
                    playerNames={data.player_names}
                    playerIdentity={
                      position.body ? (
                        <PlayerName
                          showInsignia
                          player={position.body.owner}
                          names={data.player_names}
                          fallback={playerLabel(
                            position.body.owner,
                            data.player_names,
                          )}
                        />
                      ) : undefined
                    }
                    player={model.binding?.player}
                    missions={missions}
                    origin={origin}
                    colony={colonizationStatus(
                      model.view,
                      position.coordinates.position,
                    )}
                    onDraft={draft}
                    flights={galaxyFlights(espionage.state, position)}
                    now={currentServerTime(espionage.state)}
                    espionage={
                      position.body
                        ? espionage.forTarget(position.body)
                        : undefined
                    }
                    moonEspionage={
                      publicMoonBody(position)
                        ? espionage.forTarget(publicMoonBody(position)!)
                        : undefined
                    }
                  />
                  {sitesAtPosition(tutorial.data, position.coordinates).map(
                    (site) => (
                      <GalaxySite
                        key={site.site.destination.selection.id}
                        site={site}
                        origin={origin}
                        expanded={
                          search.site === site.site.destination.selection.id
                        }
                        onToggle={() =>
                          void navigate({
                            ...galaxyTarget(
                              universe,
                              origin,
                              search.site === site.site.destination.selection.id
                                ? { galaxy, system }
                                : siteLocation(site),
                            ),
                            resetScroll: false,
                          })
                        }
                      />
                    ),
                  )}
                </li>
              ))}
            </ul>
          </section>
        </BodyAppearanceContext.Provider>
      )}
      {harvestSelection && harvestPosition && (
        <GalaxyHarvestAction
          key={harvestSelection.key}
          model={model}
          returnFocusRef={harvestOpener}
          origin={origin}
          position={harvestPosition}
          open={harvestOpen}
          onClose={() => setHarvestOpen(false)}
          onCustomize={() => {
            setHarvestOpen(false)
            onDraft(harvestPosition.coordinates, 'Harvest')
          }}
        />
      )}
    </section>
  )
}
