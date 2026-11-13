import type { components } from '../contracts'
import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useGameScreen } from '../shell/screen-context'
import { currentServerTime } from '../client-model/game-projection'
import { dispatchShips } from '../client-model/dispatch-timing'
import { Button } from '../ui/button'
import { DispatchFlightControls } from './dispatch-controls'
import { SimulationLocation } from './simulation-location'
import styles from './combat-simulation.module.css'
import type { Espionage, SimulationField } from './combat-simulation-model'
import {
  simulationFlightDraft,
  simulationAttackProblem,
} from './simulation-flight-model'
import { useDispatchTiming } from './use-dispatch-timing'

export function SimulationFlight({
  model,
  report,
  fields,
  edits,
  onClose,
}: {
  model: Coordinator
  report: Espionage
  fields: SimulationField[]
  edits: Record<string, string>
  onClose?: () => void
}) {
  const { body, view, prepareDispatch } = useGameScreen()
  const [speed, setSpeed] = useState(100)
  const now = useStore(model.store, currentServerTime)
  const stale = useStore(model.store, (s) => s.stale)
  const { draft, problem } = simulationFlightDraft(
    report,
    fields,
    edits,
    body ?? undefined,
    speed,
  )
  const attackProblem =
    draft && body ? simulationAttackProblem(draft, body) : problem
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
      <details className={styles.attackPlanning}>
        <summary>Plan attack</summary>
        <div className={styles.flightLocations}>
          {body && (
            <SimulationLocation
              body={body}
              owner={view.binding.player}
              owned
              label="Origin"
            />
          )}
          <SimulationLocation
            body={{
              id: report.target.body,
              name: report.target.name ?? undefined,
              kind: report.target.kind,
              coordinates: report.target.coordinates,
            }}
            owner={report.target.owner}
            label="Destination"
          />
        </div>
        <DispatchFlightControls
          speed={speed}
          onChange={setSpeed}
          timing={{
            terms: timing?.terms,
            mission: 'Attack',
            now,
            availableFuel: body?.amounts.deuterium,
            message: stale
              ? 'Reconnect to load flight estimates.'
              : draft
                ? timing?.error
                : '',
          }}
        />
        {onClose && (
          <Button
            type="button"
            disabled={!draft || !!attackProblem || stale}
            onClick={() => {
              if (draft && !attackProblem) {
                onClose()
                const preparedDraft = { ...draft, reviewOnOpen: true }
                prepareDispatch(preparedDraft)
              }
            }}
          >
            Review attack
          </Button>
        )}
      </details>
    </section>
  )
}
