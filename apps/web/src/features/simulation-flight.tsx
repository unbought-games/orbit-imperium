import type { components } from '../contracts'
import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useGameScreen } from '../shell/screen-context'
import { currentServerTime } from '../client-model/game-projection'
import { dispatchShips } from '../client-model/dispatch-timing'
import { Button } from '../ui/button'
import { Select } from '../ui/form'
import { CoordinateInput } from '../ui/coordinate-input'
import { coordinateText } from '../shell/location-address'
import styles from './combat-simulation.module.css'
import { bodyName, coordinates } from '../ui/format'
import type { Espionage, SimulationField } from './combat-simulation-model'
import {
  simulationFlightDraft,
  simulationAttackProblem,
  simulationDestination,
} from './simulation-flight-model'
import { useDispatchTiming } from './use-dispatch-timing'
import { DispatchTiming } from './dispatch-timing'

export function SimulationFlight({
  model,
  report,
  fields,
  edits,
  onClose,
}: {
  model: Coordinator
  report?: Espionage
  fields: SimulationField[]
  edits: Record<string, string>
  onClose?: () => void
}) {
  const { body, view, prepareDispatch, universeName } = useGameScreen()
  const [speed, setSpeed] = useState(100)
  const [destinationText, setDestinationText] = useState('')
  const [kind, setKind] = useState<'Planet' | 'Moon'>('Planet')
  const destination = simulationDestination(destinationText, model.settings)
  const now = useStore(model.store, currentServerTime)
  const stale = useStore(model.store, (s) => s.stale)
  const { draft, problem } = simulationFlightDraft(
    report,
    fields,
    edits,
    body ?? undefined,
    speed,
    destination.coordinates
      ? { coordinates: destination.coordinates, kind }
      : undefined,
  )
  const attackProblem =
    draft && body ? simulationAttackProblem(draft, body) : problem
  const inputProblem =
    !report && destination.problem ? destination.problem : problem
  const timing = useDispatchTiming(
    model,
    draft && !stale
      ? {
          kind: draft.targetKind === 'moon' ? 'Moon' : 'Planet',
          coordinates: draft.coordinates,
          observation: draft,
          intent: {
            origin: draft.origin!,
            mission: 'Attack',
            ships: dispatchShips(
              Object.keys(
                draft.ships!,
              ) as components['schemas']['FleetIntent4']['ships'][number]['ship_type'][],
              draft.ships!,
              view.binding.player,
            ),
            cargo: { metal: '0', crystal: '0', deuterium: '0' },
            speed_percent:
              speed as components['schemas']['FleetIntent4']['speed_percent'],
          },
        }
      : null,
    view.viewer_revision,
    !stale,
    true,
  )
  return (
    <section aria-label="Attack planning">
      <h3>Flight planning</h3>
      <p>
        Origin:{' '}
        {body ? `${bodyName(body)} ${coordinates(body)}` : 'No planet selected'}
        .
      </p>
      <p>
        Advisory round trip using your current drive research and universe
        rules, including for hypothetical ships. Combat edits and allied fleets
        do not change these estimates.
      </p>
      {report ? (
        <p>
          Report destination: {report.target.kind} [
          {coordinateText(report.target.coordinates)}].
        </p>
      ) : (
        <div className={styles.flightDestination}>
          <CoordinateInput
            value={destinationText}
            universe={universeName}
            onChange={(text, target) => {
              setDestinationText(text)
              if (target) setKind(target === 'moon' ? 'Moon' : 'Planet')
            }}
            error={destinationText ? destination.problem : undefined}
          />
          <label>
            Destination type
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'Planet' | 'Moon')}
            >
              <option value="Planet">Planet</option>
              <option value="Moon">Moon</option>
            </Select>
          </label>
        </div>
      )}
      <label>
        Flight speed{' '}
        <Select
          aria-label="Simulator flight speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </Select>
      </label>
      <DispatchTiming
        terms={timing?.terms}
        mission="Attack"
        now={now}
        message={
          stale
            ? 'Reconnect to check current ship availability and flight estimates.'
            : inputProblem || timing?.error
        }
      />
      {report && onClose && (
        <>
          <p>
            Estimates do not authorize a launch. Dispatch checks the target,
            protection, stationed ships, fuel and fleet slots.
          </p>
          {attackProblem && <p>{attackProblem}</p>}
          <Button
            type="button"
            disabled={!draft || !!attackProblem || stale}
            onClick={() => {
              if (draft && !attackProblem) {
                onClose()
                prepareDispatch({ ...draft, reviewOnOpen: true })
              }
            }}
          >
            Prepare attack
          </Button>
        </>
      )}
    </section>
  )
}
