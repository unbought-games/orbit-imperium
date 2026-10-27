import { useEffect, useRef, useState } from 'react'
import { Swords } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { bodyName, coordinates, label } from '../ui/format'
import { useGameScreen } from '../shell/screen-context'
import { SimulationFields } from './simulation-fields'
import { SimulationFlight } from './simulation-flight'
import { SimulationPlanning } from './combat-simulation-planning'
import {
  simulationFields,
  unknownAssumptions,
  simulationInputs,
  simulationSummary,
  averageSurvivors,
  attackerLosses,
  unsupportedReportUnits,
  type Espionage,
} from './combat-simulation-model'
import { useCombatSimulation } from './use-combat-simulation'
import { reportAge } from './report-preview'
import { currentServerTime } from '../client-model/game-projection'
import styles from './combat-simulation.module.css'
const sideNames = { attacker: 'Attacker', defender: 'Defender' }
export function ReportSimulation({
  model,
  report,
}: {
  model: Coordinator
  report: Espionage
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  function close() {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  return (
    <>
      <Button
        variant="secondary"
        size="icon-small"
        ref={trigger}
        aria-label="Simulate combat"
        title="Simulate combat"
        onClick={() => setOpen(true)}
      >
        <Swords size={18} aria-hidden="true" />
      </Button>
      {open && (
        <SimulationDialog model={model} report={report} onClose={close} />
      )}
    </>
  )
}
function SimulationDialog({
  model,
  report,
  onClose,
}: {
  model: Coordinator
  report: Espionage
  onClose: () => void
}) {
  const view = useStore(model.store, (s) => s.view)
  const binding = useStore(model.store, (s) => s.binding)
  // Changing identity or rules remounts the draft, so no previous-account results survive.
  return (
    <SimulationForm
      key={JSON.stringify([binding, view?.profile_hash])}
      model={model}
      report={report}
      onClose={onClose}
    />
  )
}
function SimulationForm({
  model,
  report,
  onClose,
}: {
  model: Coordinator
  report: Espionage
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const view = useStore(model.store, (s) => s.view)
  const now = useStore(model.store, currentServerTime)
  const { body } = useGameScreen()
  const stale = useStore(model.store, (s) => s.stale)
  const fields = simulationFields(
    report,
    view?.catalog ?? [],
    view?.research ?? [],
    body?.inventories,
  )
  const scope = JSON.stringify([report, view?.research, view?.profile_hash])
  const { edits, result, error, running, edit, run } = useCombatSimulation(
    model,
    scope,
  )
  const assumptions = unknownAssumptions(fields, edits)
  const prepared = simulationInputs(fields, edits, report.resources)
  const unsupported = unsupportedReportUnits(report, fields)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  return createPortal(
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="simulation-title"
      onCancel={onClose}
    >
      <header>
        <h2 id="simulation-title">Combat simulation</h2>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className={styles.content}>
        <p>
          Defender at [{report.target.coordinates.galaxy}:
          {report.target.coordinates.system}:
          {report.target.coordinates.position}] · observed{' '}
          <time dateTime={new Date(report.observed_at).toISOString()}>
            {new Date(report.observed_at).toLocaleString()}
          </time>{' '}
          ({reportAge(report.observed_at, now)}).
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (prepared.inputs && !unsupported.length)
              void run(prepared.inputs)
          }}
        >
          <div className={styles.sides}>
            {(['attacker', 'defender'] as const).map((side) => (
              <fieldset key={side} disabled={running}>
                <legend>{sideNames[side]}</legend>
                {side === 'attacker' && (
                  <p>
                    {body
                      ? `Stationed on ${bodyName(body)} ${coordinates(body)}${stale ? ' · last known inventory (reconnecting)' : ''}.`
                      : 'Select a planet to see stationed ship availability.'}{' '}
                    Availability is a reference; hypothetical quantities are
                    allowed.
                  </p>
                )}
                {side === 'defender' && Object.keys(assumptions).length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => edit(assumptions)}
                  >
                    Assume all unknown values are zero
                  </Button>
                )}
                <SimulationFields
                  fields={fields.filter((f) => f.side === side)}
                  edits={edits}
                  edit={edit}
                />
              </fieldset>
            ))}
          </div>
          <p>
            Ten randomized battles using this universe’s current combat rules.
            Limit: 2,000 units combined; technology 0–100. Missiles, defense
            repairs and debris recovery are excluded.
          </p>
          {unsupported.length > 0 && (
            <p role="alert">
              This report contains units unsupported by the current combat
              rules. It cannot be simulated without dropping observed forces.
            </p>
          )}
          {prepared.error && <p role="status">{prepared.error}</p>}
          {error && <p role="alert">{error}</p>}
          <Button
            type="submit"
            disabled={!prepared.inputs || running || !!unsupported.length}
          >
            {running ? 'Simulating…' : 'Run 10 battles'}
          </Button>
        </form>
        <SimulationFlight
          model={model}
          report={report}
          fields={fields}
          edits={edits}
          onClose={onClose}
        />
        {result && (
          <section aria-label="Simulation results" aria-live="polite">
            <h3>Sample results · attacker perspective</h3>
            <p>A sample of possible outcomes, not a prediction or guarantee.</p>
            <div className={styles.outcomes}>
              {simulationSummary(result).map((row) => (
                <p
                  key={row.outcome}
                  className={
                    row.outcome === 'AttackerVictory'
                      ? styles.win
                      : row.outcome === 'DefenderVictory'
                        ? styles.loss
                        : undefined
                  }
                >
                  <strong>
                    {row.count} / {result.samples.length}
                  </strong>{' '}
                  {row.outcome === 'AttackerVictory'
                    ? 'Victory · attacker wins'
                    : row.outcome === 'DefenderVictory'
                      ? 'Defeat · defender wins'
                      : label(row.outcome)}
                </p>
              ))}
            </div>
            {(['attacker', 'defender'] as const).map((side) => (
              <div key={side}>
                <h4>
                  {side === 'attacker'
                    ? 'Attacker · average losses and survivors'
                    : 'Defender · average survivors before repairs'}
                </h4>
                <dl className={styles.survivors}>
                  {fields
                    .filter(
                      (f) =>
                        f.side === side &&
                        f.item &&
                        Number(edits[f.key] ?? f.value) > 0,
                    )
                    .map((f) => (
                      <div key={f.key}>
                        <dt>{label(f.label)}</dt>
                        <dd>
                          {side === 'attacker' && (
                            <strong>
                              {attackerLosses(result, {
                                item: f.item!,
                                count: Number(edits[f.key] ?? f.value),
                              }).toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })}{' '}
                              lost ·{' '}
                            </strong>
                          )}
                          {averageSurvivors(
                            result,
                            side,
                            f.item!,
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })}
                          {side === 'attacker' ? ' surviving' : ''}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
            <SimulationPlanning result={result} />
          </section>
        )}
        <details className={styles.help}>
          <summary>About report snapshots and assumptions</summary>
          <p>
            This is a historical snapshot. Resources, fleets, defenses and
            research may have changed. Unknown is not zero. Player edits are
            assumptions; the target is never refreshed.
          </p>
        </details>
      </div>
    </dialog>,
    document.body,
  )
}
