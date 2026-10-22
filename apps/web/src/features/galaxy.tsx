import { ChevronLeft, ChevronRight, RefreshCw, Orbit } from 'lucide-react'
import { Link } from '../ui/link'
import { Button } from '../ui/button'
import { Select, Field } from '../ui/form'
import styles from './galaxy.module.css'
import { useEffect, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { DispatchDraft } from './missions'
import { routeTarget } from '../shell/route-target'
import { GalaxyPosition } from './galaxy-position'
import { GalaxyAtlas } from './galaxy-atlas'
import { Heading, Text } from '../ui/typography'
import { exactTime } from './mission-presentation'
import { colonizationStatus } from './colonization'
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
  const [galaxy, setGalaxy] = useState(home?.galaxy ?? 1)
  const [system, setSystem] = useState(home?.system ?? 1)
  const [result, setResult] = useState<{
    data: System | null
    error: string
    loading: boolean
  }>({ data: null, error: '', loading: true })
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
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
  }, [model, galaxy, system, model.view?.viewer_revision, refresh])
  // A response for a previous system must never supply actionable rows.
  const data =
    result.data?.galaxy === galaxy && result.data.system === system
      ? result.data
      : null
  const canAttack = model.view?.capabilities.some(
    (c) => c.capability === 'Attack' && c.enabled,
  )
  return (
    <section className={styles.screen} aria-label="Galaxy browser">
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Astronomical atlas</p>
        <Heading level={2} className={styles.title}>
          A wider horizon.
        </Heading>
        <Text>
          Explore the observed worlds of Galaxy {galaxy}, System {system}.
        </Text>
      </header>
      <div className={styles.toolbar}>
        <Orbit size={20} aria-hidden="true" />
        <Field>
          Galaxy
          <Select
            value={galaxy}
            onChange={(e) => setGalaxy(Number(e.target.value))}
          >
            {Array.from({ length: model.settings?.galaxies ?? 1 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </Select>
        </Field>
        <Button
          aria-label="Previous system"
          title="Previous system"
          disabled={system <= 1}
          onClick={() => setSystem((s) => s - 1)}
        >
          <ChevronLeft size={18} />
        </Button>
        <Field>
          Solar system
          <Select
            value={system}
            onChange={(e) => setSystem(Number(e.target.value))}
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
          aria-label="Next system"
          title="Next system"
          disabled={system >= (model.settings?.systems_per_galaxy ?? 5)}
          onClick={() => setSystem((s) => s + 1)}
        >
          <ChevronRight size={18} />
        </Button>
        <Button
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
      {result.error && (
        <p role="alert" className={styles.error}>
          {result.error}
        </p>
      )}
      {result.loading && (
        <p role="status" className={styles.loading}>
          Loading system…
        </p>
      )}
      {data && <GalaxyAtlas system={data} />}
      {data && (
        <section className={styles.positions} aria-label="Galaxy positions">
          <ul className={styles.positionList}>
            {data.positions.map((position) => (
              <li
                id={`position-${position.coordinates.position}`}
                key={`${data.galaxy}:${data.system}:${position.coordinates.position}`}
              >
                <GalaxyPosition
                  position={position}
                  playerNames={data.player_names}
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
