import {
  allyFields,
  withSimulationAllies,
  combinedSimulationUnits,
} from './simulation-allies'
import { useEffect, useRef, useState } from 'react'
import { Swords } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { Select } from '../ui/form'
import { Button } from '../ui/button'
import { bodyName, coordinates, label } from '../ui/format'
import { useGameScreen } from '../shell/screen-context'
import { ownedDefenderImport } from './simulation-import'
import { SimulationFields } from './simulation-fields'
import { SimulationFlight } from './simulation-flight'
import { SimulationPlanning } from './combat-simulation-planning'
import {
  simulationFields,
  blankSimulationEdits,
  simulationInputs,
  simulationSummary,
  averageSurvivors,
  attackerLosses,
  unsupportedReportUnits,
  type Espionage,
  type MoonTarget,
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
  const dialog = useRef<HTMLDialogElement>(null)
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
      <SimulationSession model={model} report={report} onClose={onClose} />
    </dialog>,
    document.body,
  )
}

export function CombatSimulator() {
  const { model } = useGameScreen()
  return <SimulationSession model={model} />
}

function SimulationSession(props: {
  model: Coordinator
  report?: Espionage
  onClose?: () => void
}) {
  const view = useStore(props.model.store, (s) => s.view)
  const binding = useStore(props.model.store, (s) => s.binding)
  // Changing identity or rules remounts the draft, so no previous-account results survive.
  return (
    <SimulationForm
      key={JSON.stringify([binding, view?.profile_hash])}
      {...props}
    />
  )
}
function SimulationForm({
  model,
  report,
  onClose,
}: {
  model: Coordinator
  report?: Espionage
  onClose?: () => void
}) {
  const view = useStore(model.store, (s) => s.view)
  const now = useStore(model.store, currentServerTime)
  const { body } = useGameScreen()
  const stale = useStore(model.store, (s) => s.stale)
  const [includeShips, setIncludeShips] = useState(false)
  const [moonTarget, setMoonTarget] = useState<MoonTarget>(
    report?.target.kind === 'Moon' ? 'Moon' : 'Unknown',
  )
  const scope = JSON.stringify([report, view?.research, view?.profile_hash])
  const {
    allies,
    addAlly,
    removeAlly,
    edits,
    defenderSource,
    replaceDefender,
    result,
    error,
    running,
    edit,
    run,
  } = useCombatSimulation(model, scope)
  const defenderReport = defenderSource ? undefined : report
  const fields = simulationFields(
    defenderReport,
    view?.catalog ?? [],
    view?.research ?? [],
    body?.inventories,
  ).map((field) =>
    defenderSource && field.side === 'defender'
      ? { ...field, source: 'Imported plan' as const }
      : field,
  )
  const worldImport = ownedDefenderImport(view, body?.id, includeShips, stale)
  const prepared = withSimulationAllies(
    simulationInputs(fields, edits, defenderReport?.resources),
    fields,
    allies,
    edits,
  )
  const unsupported = defenderReport
    ? unsupportedReportUnits(defenderReport, fields)
    : []
  return (
    <div className={styles.content}>
      {!defenderSource && report && (
        <p>
          Defender at [{report.target.coordinates.galaxy}:
          {report.target.coordinates.system}:
          {report.target.coordinates.position}] · observed{' '}
          <time dateTime={new Date(report.observed_at).toISOString()}>
            {new Date(report.observed_at).toLocaleString()}
          </time>{' '}
          ({reportAge(report.observed_at, now)}).
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          edit(
            blankSimulationEdits(
              [
                ...fields,
                ...allies.flatMap((ally) => allyFields(fields, ally)),
              ],
              edits,
            ),
          )
          if (prepared.inputs && !unsupported.length) void run(prepared.inputs)
        }}
      >
        <div className={styles.setupContext}>
          <p>
            {body
              ? `Stationed on ${bodyName(body)} ${coordinates(body)}${stale ? ' · last known inventory (reconnecting)' : ''}.`
              : 'Select a planet to see stationed ship availability.'}{' '}
            Hypothetical fleets are allowed.
          </p>
          <details className={styles.importDisclosure}>
            <summary>Load owned defender</summary>
            <div className={styles.importControls}>
              <p>
                Load{' '}
                {body
                  ? `${bodyName(body)} ${coordinates(body)}`
                  : 'your selected world'}{' '}
                as defender. Replaces this defender’s research, defenses and
                ships. Attacker and allied fleets stay as entered.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={includeShips}
                  onChange={(event) => setIncludeShips(event.target.checked)}
                />{' '}
                Include stationed ships
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={!worldImport.values}
                onClick={() => {
                  if (worldImport.values) {
                    replaceDefender(worldImport.values, worldImport.source)
                    setMoonTarget(worldImport.moonTarget)
                  }
                }}
              >
                Replace defender from current{' '}
                {body?.kind === 'Moon' ? 'moon' : 'planet'}
              </Button>
              <small>
                Without stationed ships, all defender ship counts are set to
                zero.
              </small>
              {defenderSource && (
                <p role="status">
                  Defender imported from {defenderSource}. Values stay as
                  entered until you replace them.
                  {report &&
                    ' Report coordinates still apply to attack planning.'}
                </p>
              )}
              {worldImport.error && <p>{worldImport.error}</p>}
              {report && defenderSource && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    replaceDefender({}, null)
                    setMoonTarget(
                      report?.target.kind === 'Moon' ? 'Moon' : 'Unknown',
                    )
                  }}
                >
                  Replace defender from report
                </Button>
              )}
            </div>
          </details>
        </div>
        <div className={styles.sides}>
          {(['attacker', 'defender'] as const).map((side) => (
            <fieldset key={side} disabled={running}>
              <legend>{sideNames[side]}</legend>
              <SimulationFields
                fields={fields.filter((f) => f.side === side)}
                alignShipsWith={
                  side === 'attacker'
                    ? fields.filter(
                        (f) => f.side === 'defender' && f.item?.kind === 'Ship',
                      )
                    : undefined
                }
                edits={edits}
                edit={edit}
              />
            </fieldset>
          ))}
        </div>
        {allies.map((ally, index) => (
          <fieldset
            className={styles.contingent}
            key={ally.id}
            disabled={running}
          >
            <legend>
              Allied {ally.side === 'attacker' ? 'attacking' : 'defending'}{' '}
              fleet {index + 1}
            </legend>
            <p>
              Enter this owner’s technology and ships. No private player data is
              imported.
            </p>
            <SimulationFields
              fields={allyFields(fields, ally)}
              edits={edits}
              edit={edit}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => removeAlly(ally.id)}
            >
              Remove allied fleet
            </Button>
          </fieldset>
        ))}
        <div className={`${styles.sides} ${styles.alliedActions}`}>
          <Button
            type="button"
            variant="secondary"
            disabled={
              running ||
              allies.filter((a) => a.side === 'attacker').length >= 15
            }
            onClick={() => addAlly('attacker')}
          >
            Add attacking fleet
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={
              running ||
              allies.filter((a) => a.side === 'defender').length >= 16
            }
            onClick={() => addAlly('defender')}
          >
            Add defending fleet
          </Button>
        </div>
        <label className={styles.moonTarget}>
          Moon creation target
          <Select
            value={moonTarget}
            onChange={(event) =>
              setMoonTarget(event.target.value as MoonTarget)
            }
          >
            <option value="Unknown">Unknown moon eligibility</option>
            <option value="PlanetWithoutMoon">Planet without a moon</option>
            <option value="PlanetWithMoon">Planet with an existing moon</option>
            <option value="Moon">Moon</option>
          </Select>
          <small>Editable assumption; target occupancy is not refreshed.</small>
        </label>
        {unsupported.length > 0 && (
          <p role="alert">
            This report contains units unsupported by the current combat rules.
            It cannot be simulated without dropping observed forces.
          </p>
        )}
        <div className={styles.runControls}>
          {prepared.error && <p role="status">{prepared.error}</p>}
          {error && <p role="alert">{error}</p>}
          <Button
            type="submit"
            disabled={!prepared.inputs || running || !!unsupported.length}
          >
            {running ? 'Simulating…' : 'Run 10 battles'}
          </Button>
        </div>
      </form>
      {result && (
        <section aria-label="Simulation results" aria-live="polite">
          <h3>Sample results · attacker perspective</h3>
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
                  ? 'Victory'
                  : row.outcome === 'DefenderVictory'
                    ? 'Defeat'
                    : label(row.outcome)}
              </p>
            ))}
          </div>
          <SimulationPlanning result={result} moonTarget={moonTarget} />
          <details className={styles.resultDetails}>
            <summary>Losses and survivors</summary>
            {(['attacker', 'defender'] as const).map((side) => (
              <div key={side}>
                <h4>
                  {side === 'attacker'
                    ? 'Attacker · average losses and survivors'
                    : 'Defender · average survivors before repairs'}
                </h4>
                <dl className={styles.survivors}>
                  {combinedSimulationUnits(prepared.inputs, side, fields).map(
                    (unit) => (
                      <div key={`${unit.item.kind}:${unit.item.id}`}>
                        <dt>{label(unit.item.id)}</dt>
                        <dd>
                          {side === 'attacker' && (
                            <strong>
                              {attackerLosses(result, unit).toLocaleString(
                                undefined,
                                { maximumFractionDigits: 1 },
                              )}{' '}
                              lost ·{' '}
                            </strong>
                          )}
                          {averageSurvivors(
                            result,
                            side,
                            unit.item,
                          ).toLocaleString(undefined, {
                            maximumFractionDigits: 1,
                          })}{' '}
                          surviving
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </div>
            ))}
          </details>
        </section>
      )}
      <details className={styles.help}>
        <summary>Simulation assumptions</summary>
        <p>
          Ten randomized battles using this universe’s current combat rules.
          Limit: 2,000 units combined; technology 0–100. Missiles, defense
          repairs and debris recovery are excluded. Outcomes are samples, not
          guarantees.
        </p>
        <p>
          Availability is a reference; hypothetical quantities are allowed.
          Unobserved forces and technology are assumed zero. Unknown resources
          stay unknown. Player edits are assumptions.
        </p>
        {report && (
          <p>
            This is a historical snapshot. Resources, fleets, defenses and
            research may have changed; the target is never refreshed.
          </p>
        )}
        <p>
          Loot assumes empty cargo on arrival, before fuel costs. Only victories
          with surviving cargo capacity can loot. Each battle uses the
          universe’s loot rules and report-observed resources; no production or
          spending is forecast. Averages are rounded down to whole resource
          units.
        </p>
        {report && (
          <p>
            Prepare attack opens an editable Dispatch draft. Flight estimates
            use your current research, including for hypothetical ships.
            Dispatch checks the target, protection, fuel and fleet slots before
            launch.
          </p>
        )}
      </details>
      <SimulationFlight
        model={model}
        report={report}
        fields={fields}
        edits={edits}
        onClose={onClose}
      />
    </div>
  )
}
