import type { components } from '../contracts'
import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useGameScreen } from '../shell/screen-context'
import { currentServerTime } from '../client-model/game-projection'
import { dispatchShips } from '../client-model/dispatch-timing'
import { Button } from '../ui/button'
import { Select } from '../ui/form'
import { bodyName, coordinates } from '../ui/format'
import type { Espionage, SimulationField } from './combat-simulation-model'
import { simulationAttackDraft } from './simulation-flight-model'
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
  report: Espionage
  fields: SimulationField[]
  edits: Record<string, string>
  onClose: () => void
}) {
  const { body, view, prepareDispatch } = useGameScreen()
  const [speed, setSpeed] = useState(100)
  const now = useStore(model.store, currentServerTime)
  const stale = useStore(model.store, (s) => s.stale)
  const { draft, problem } = simulationAttackDraft(
    report,
    fields,
    edits,
    body ?? undefined,
    speed,
  )
  const timing = useDispatchTiming(
    model,
    draft && !stale
      ? {
          kind: report.target.kind,
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
  )
  return (
    <section aria-label="Attack planning">
      <h3>Attack planning</h3>
      <p>
        Origin:{' '}
        {body ? `${bodyName(body)} ${coordinates(body)}` : 'No planet selected'}
        .
      </p>
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
            : problem || timing?.error
        }
      />
      <Button
        type="button"
        disabled={!draft || stale}
        onClick={() => {
          if (draft) {
            onClose()
            prepareDispatch(draft)
          }
        }}
      >
        Prepare attack
      </Button>
    </section>
  )
}
