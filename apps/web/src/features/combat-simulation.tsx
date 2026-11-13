import {
  allyFields,
  withSimulationAllies,
  combinedSimulationUnits,
} from './simulation-allies'
import { useEffect, useRef, useState } from 'react'
import { Swords, ScanEye, X, CornerDownRight } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { Link } from '../ui/link'
import { routeTarget } from '../shell/route-target'
import { SimulationLocation } from './simulation-location'
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
  reportId,
}: {
  model: Coordinator
  report: Espionage
  reportId: string
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
        <SimulationDialog
          model={model}
          report={report}
          reportId={reportId}
          onClose={close}
        />
      )}
    </>
  )
}
function SimulationDialog({
  model,
  report,
  reportId,
  onClose,
}: {
  model: Coordinator
  report: Espionage
  reportId: string
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
      <SimulationSession
        model={model}
        report={report}
        reportId={reportId}
        onClose={onClose}
      />
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
  reportId?: string
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
  reportId,
  onClose,
}: {
  model: Coordinator
  report?: Espionage
  reportId?: string
  onClose?: () => void
}) {
  const view = useStore(model.store, (s) => s.view)
  const now = useStore(model.store, currentServerTime)
  const { body, universeName } = useGameScreen()
  const [reportAttached, setReportAttached] = useState(true)
  const activeReport = reportAttached ? report : undefined
  const stale = useStore(model.store, (s) => s.stale)
  const [includeShips, setIncludeShips] = useState(false)
  const [moonTarget, setMoonTarget] = useState<MoonTarget>(
    report?.target.kind === 'Moon' ? 'Moon' : 'Unknown',
  )
  const scope = JSON.stringify([
    activeReport,
    view?.research,
    view?.profile_hash,
  ])
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
  const defenderReport = defenderSource ? undefined : activeReport
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
      {activeReport && (
        <div className={styles.matchup}>
          {body && view && (
            <>
              <SimulationLocation
                body={body}
                owner={view.binding.player}
                owned
                label="Origin"
              />
              <span className={styles.versus}>versus</span>
            </>
          )}
          <div className={styles.reportContext}>
            <SimulationLocation
              body={{
                id: activeReport.target.body,
                name: activeReport.target.name ?? undefined,
                kind: activeReport.target.kind,
                coordinates: activeReport.target.coordinates,
              }}
              owner={activeReport.target.owner}
              label="Target"
            />
            <div className={styles.reportLink}>
              <CornerDownRight size={16} aria-hidden="true" />
              <ScanEye size={16} aria-hidden="true" />
              <Link
                {...routeTarget(universeName, 'reports', body?.id, reportId)}
                onClick={onClose}
              >
                Espionage report ·{' '}
                <time
                  dateTime={new Date(activeReport.observed_at).toISOString()}
                  title={new Date(activeReport.observed_at).toLocaleString()}
                >
                  {reportAge(activeReport.observed_at, now)}
                </time>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-touch"
                aria-label="Clear espionage report"
                title="Keep entered fleets and clear report context"
                onClick={() => {
                  replaceDefender(
                    Object.fromEntries(
                      fields
                        .filter((field) => field.side === 'defender')
                        .map((field) => [
                          field.key,
                          edits[field.key] ?? field.value ?? '0',
                        ]),
                    ),
                    defenderSource,
                  )
                  setReportAttached(false)
                  if (!defenderSource) setMoonTarget('Unknown')
                }}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
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
          {!activeReport && body && view && (
            <SimulationLocation
              body={body}
              owner={view.binding.player}
              owned
              label="Origin"
            />
          )}
          <details className={styles.importDisclosure}>
            <summary>
              Use my {body?.kind === 'Moon' ? 'moon' : 'planet'} as defender
            </summary>
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
                </p>
              )}
              {worldImport.error && <p>{worldImport.error}</p>}
              {activeReport && defenderSource && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    replaceDefender({}, null)
                    setMoonTarget(
                      activeReport?.target.kind === 'Moon' ? 'Moon' : 'Unknown',
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
                key={`${side}-${defenderReport ? 'report' : 'manual'}`}
                fields={fields.filter((f) => f.side === side)}
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
        {unsupported.length > 0 && (
          <p role="alert">
            This report contains units unsupported by the current combat rules.
            It cannot be simulated without dropping observed forces.
          </p>
        )}
        <div className={styles.runControls}>
          <Button
            type="submit"
            disabled={!prepared.inputs || running || !!unsupported.length}
          >
            {running ? 'Simulating…' : 'Run 10 battles'}
          </Button>
          {prepared.error && <p role="status">{prepared.error}</p>}
          {error && <p role="alert">{error}</p>}
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
      {activeReport && (
        <SimulationFlight
          model={model}
          report={activeReport}
          fields={fields}
          edits={edits}
          onClose={onClose}
        />
      )}
    </div>
  )
}
