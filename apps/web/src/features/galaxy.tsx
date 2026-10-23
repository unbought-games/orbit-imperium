import { useProfileSource } from '../shell/player-profiles-context'
import { PlayerName } from './player-name'
import { ChevronLeft, ChevronRight, RefreshCw, Orbit } from 'lucide-react'
import { Link } from '../ui/link'
import { Button } from '../ui/button'
import { Select, Field } from '../ui/form'
import styles from './galaxy.module.css'
import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { galaxyTarget } from '../shell/galaxy-location'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { DispatchDraft } from './missions'
import { routeTarget } from '../shell/route-target'
import { GalaxyPosition } from './galaxy-position'
import { GalaxyAtlas } from './galaxy-atlas'
import { TaskHeader } from '../ui/task-header'
import { exactTime } from './mission-presentation'
import { colonizationStatus } from '../client-model/colonization'
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
  ) => void
}) {
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
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    if (!valid) return
    let current = true
    setResult({ data: null, error: '', loading: true })
    void model
      .world({ type: 'Galaxy', galaxy, system })
      .then((v) => {
        if (current)
          setResult(
            v && 'positions' in v
              ? { data: v, error: '', loading: false }
              : {
                  data: null,
                  error: 'Galaxy unavailable. Try again after reconnecting.',
                  loading: false,
                },
          )
      })
      .catch(() => {
        if (current)
          setResult({
            data: null,
            error: 'Galaxy unavailable. Try again after reconnecting.',
            loading: false,
          })
      })
    return () => {
      current = false
    }
  }, [model, galaxy, system, valid, model.view?.viewer_revision, refresh])
  // A response for a previous system must never supply actionable rows.
  const data =
    valid && result.data?.galaxy === galaxy && result.data.system === system
      ? result.data
      : null
  const loaded = !!data
  useEffect(() => {
    if (loaded && position !== undefined) {
      const target = document.getElementById(`position-${position}`)
      // Focus the destination so the shell's deferred heading scroll cannot
      // hide a position selected within an already loaded system.
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'center' })
    }
  }, [loaded, galaxy, system, position])
  const canAttack = model.view?.capabilities.some(
    (c) => c.capability === 'Attack' && c.enabled,
  )
  useProfileSource(
    data ? { type: 'Galaxy', galaxy: data.galaxy, system: data.system } : null,
    model.view?.viewer_revision,
  )
  return (
    <section className={styles.screen} aria-label="Galaxy browser">
      <TaskHeader title="Galaxy" />
      <div className={styles.toolbar}>
        <Orbit size={20} aria-hidden="true" />
        <Field>
          Galaxy
          <Select
            value={galaxy}
            onChange={(e) => browse(Number(e.target.value), system)}
          >
            {Array.from({ length: model.settings?.galaxies ?? 1 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Previous system"
          title="Previous system"
          disabled={system <= 1}
          onClick={() => browse(galaxy, system - 1)}
        >
          <ChevronLeft size={18} />
        </Button>
        <Field>
          Solar system
          <Select
            value={system}
            onChange={(e) => browse(galaxy, Number(e.target.value))}
          >
            {Array.from(
              { length: model.settings?.systems_per_galaxy ?? 5 },
              (_, i) => (
                <option key={i + 1}>{i + 1}</option>
              ),
            )}
          </Select>
        </Field>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Next system"
          title="Next system"
          disabled={system >= (model.settings?.systems_per_galaxy ?? 5)}
          onClick={() => browse(galaxy, system + 1)}
        >
          <ChevronRight size={18} />
        </Button>
        <Button
          variant="secondary"
          aria-label="Refresh galaxy"
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
        <span className={styles.slots}>
          {model.view?.protocol === 4
            ? `${model.view.missions.fleets.length} / ${model.view.missions.fleet_slots} fleet slots`
            : ''}
        </span>
      </div>
      <div className={styles.status}>
        <span>
          Galaxy {galaxy} · System {system}
        </span>
        <span>Browsing is free · Activity can be caused by fleets</span>
      </div>
      {!valid && (
        <p role="alert">These coordinates are outside this universe.</p>
      )}
      {valid && result.error && (
        <p role="alert" className={styles.error}>
          {result.error}
        </p>
      )}
      {valid && result.loading && (
        <p role="status" className={styles.loading}>
          Loading system…
        </p>
      )}
      {data && (
        <details className={styles.map}>
          <summary>System map</summary>
          <GalaxyAtlas system={data} />
        </details>
      )}
      {data && (
        <section className={styles.positions} aria-label="Galaxy positions">
          <ul className={styles.positionList}>
            {data.positions.map((position) => (
              <li
                id={`position-${position.coordinates.position}`}
                tabIndex={-1}
                aria-current={
                  position.coordinates.position === search.position
                    ? 'location'
                    : undefined
                }
                className={
                  position.coordinates.position === search.position
                    ? styles.selectedPosition
                    : undefined
                }
                key={`${data.galaxy}:${data.system}:${position.coordinates.position}`}
              >
                {position.coordinates.position === search.position && (
                  <p className={styles.locationLabel}>
                    Selected location [{galaxy}:{system}:{search.position}]
                  </p>
                )}
                <GalaxyPosition
                  position={position}
                  playerNames={data.player_names}
                  playerIdentity={
                    position.body ? (
                      <PlayerName
                        player={position.body.owner}
                        names={data.player_names}
                        fallback={
                          position.body.owner === model.binding?.player
                            ? 'You'
                            : undefined
                        }
                      />
                    ) : undefined
                  }
                  player={model.binding?.player}
                  canAttack={!!canAttack}
                  origin={origin}
                  colony={colonizationStatus(
                    model.view,
                    position.coordinates.position,
                  )}
                  onDraft={onDraft}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer>
        <span>
          {data
            ? `Observed ${exactTime(data.observed_at)}`
            : 'No system observation available'}
        </span>
        <Link {...routeTarget(universe, 'dispatch', origin)}>
          Enter a destination manually
        </Link>
      </footer>
    </section>
  )
}
