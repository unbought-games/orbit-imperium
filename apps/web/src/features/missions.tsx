import { CoordinateLink } from './coordinate-link'
import { useId } from 'react'
import { useUniverseName } from '../shell/session-context'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { useStore } from 'zustand'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { useDispatch } from './use-dispatch'
import { canSubmitQuote } from '../client-model/game-projection'
import { ButtonLink } from '../ui/button'
import { QuotePanel, QuoteAction } from '../ui/quote-panel'
import { Button } from '../ui/button'
import { Input } from '../ui/form'
import { ResourceMark } from '../ui/resource-mark'
import { resourceNames } from '../client-model/resources'
import { Select } from '../ui/form'
import { Field } from '../ui/form'
import { Form } from '../ui/form'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Heading } from '../ui/typography'
import styles from './missions.module.css'
import { exactTime, shipManifest } from './mission-presentation'
import { TaskHeader } from '../ui/task-header'
import { DispatchTiming } from './dispatch-timing'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { bodyName, label } from '../ui/format'
type S = components['schemas']
export type DispatchDraft = {
  origin?: string
  coordinates: S['Coordinates']
  mission:
    | 'Transport'
    | 'Espionage'
    | 'Harvest'
    | 'Attack'
    | 'Colonize'
    | 'Deploy'
  observedAt?: number
  target?: S['MissionDestination4']
}
export { MissionFleets } from './mission-fleets'
export function Dispatch({
  model,
  view,
  body,
  draft,
}: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  draft: DispatchDraft | null
}) {
  const universeName = useUniverseName()
  const validationId = useId()
  const occupiedSlots = useStore(model.store, occupiedFleetSlots)
  const {
    coordinateProblems,
    coordinatesValid,
    targetProblem,
    attackWarning,
    mission,
    colony,
    setMission,
    galaxy,
    setGalaxy,
    system,
    setSystem,
    position,
    setPosition,
    pasteCoordinates,
    speed,
    setSpeed,
    ships,
    setShips,
    cargo,
    setCargo,
    addAllCargo,
    quote,
    setQuote,
    error,
    busy,
    now,
    types,
    quoteRef,
    reviewButtonRef,
    command,
    send,
    clear,
    review,
    targetName,
    timing,
    timingMessage,
  } = useDispatch({ model, view, body, draft })
  return (
    <Section className={styles.screen}>
      <TaskHeader>
        <span>
          Origin {bodyName(body)}{' '}
          <CoordinateLink at={body.coordinates} label="origin" /> · Fleet slots:{' '}
          {occupiedSlots} / {view.missions.fleet_slots}
        </span>
      </TaskHeader>
      {targetName && (
        <Text>
          Destination: {targetName}{' '}
          <CoordinateLink
            at={{
              galaxy: Number(galaxy),
              system: Number(system),
              position: Number(position),
            }}
            label="destination"
          />
        </Text>
      )}
      {mission === 'Colonize' && (
        <Text role="status">
          Planets: {colony.count} / {colony.capacity}.{' '}
          {colony.reason ?? colony.warning} Requires at least one Colony Ship.
        </Text>
      )}
      {mission === 'Deploy' && (
        <Text>
          Deployment transfers ships and cargo permanently to another owned
          planet and credits half the paid fuel, rounded down.
        </Text>
      )}
      {draft?.observedAt !== undefined && (
        <Text>
          Prepared from an observation at{' '}
          {new Date(draft.observedAt).toLocaleString()}. This is historical
          information; review requests a fresh destination and legal quote.
        </Text>
      )}
      <div className={styles.dispatchLayout} hidden={!!quote}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            void review()
          }}
        >
          <fieldset
            className={styles.destinationFields}
            aria-label="Mission and destination"
          >
            <Field>
              Mission
              <Select
                value={mission}
                onChange={(e) => {
                  setMission(e.target.value as DispatchDraft['mission'])
                  clear()
                }}
              >
                {(
                  [
                    'Transport',
                    'Espionage',
                    'Harvest',
                    'Attack',
                    'Colonize',
                    'Deploy',
                  ] as const
                )
                  .filter(
                    (m) =>
                      m === mission ||
                      view.capabilities.some(
                        (c) => c.capability === m && c.enabled,
                      ),
                  )
                  .map((m) => (
                    <option key={m}>{m}</option>
                  ))}
              </Select>
            </Field>
            <Field>
              <span id={`${validationId}-galaxy-label`}>Galaxy</span>
              <Input
                inputMode="numeric"
                aria-labelledby={`${validationId}-galaxy-label`}
                onPaste={pasteCoordinates}
                aria-invalid={!!coordinateProblems.galaxy}
                aria-describedby={`${validationId}-galaxy`}
                value={galaxy}
                onChange={(e) => {
                  setGalaxy(e.target.value)
                  clear()
                }}
              />
              <span
                className={styles.fieldError}
                id={`${validationId}-galaxy`}
                role={coordinateProblems.galaxy ? 'alert' : undefined}
              >
                {coordinateProblems.galaxy}
              </span>
            </Field>
            <Field>
              <span id={`${validationId}-system-label`}>System</span>
              <Input
                inputMode="numeric"
                aria-labelledby={`${validationId}-system-label`}
                onPaste={pasteCoordinates}
                aria-invalid={!!coordinateProblems.system}
                aria-describedby={`${validationId}-system`}
                value={system}
                onChange={(e) => {
                  setSystem(e.target.value)
                  clear()
                }}
              />
              <span
                className={styles.fieldError}
                id={`${validationId}-system`}
                role={coordinateProblems.system ? 'alert' : undefined}
              >
                {coordinateProblems.system}
              </span>
            </Field>
            <Field>
              <span id={`${validationId}-position-label`}>Position</span>
              <Input
                inputMode="numeric"
                aria-labelledby={`${validationId}-position-label`}
                onPaste={pasteCoordinates}
                aria-invalid={!!coordinateProblems.position}
                aria-describedby={`${validationId}-position`}
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value)
                  clear()
                }}
              />
              <span
                className={styles.fieldError}
                id={`${validationId}-position`}
                role={coordinateProblems.position ? 'alert' : undefined}
              >
                {coordinateProblems.position}
              </span>
            </Field>
            <Field>
              Speed
              <Select
                aria-label="Speed"
                value={speed}
                onChange={(e) => {
                  setSpeed(Number(e.target.value))
                  clear()
                }}
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <option key={i} value={(i + 1) * 10}>
                    {(i + 1) * 10}%
                  </option>
                ))}
              </Select>
            </Field>
            <DispatchTiming terms={timing} now={now} message={timingMessage} />
            {mission === 'Attack' && !targetProblem && !attackWarning && (
              <Text className={styles.destinationNotice}>
                Beginner protection can prevent attacks between players of
                different strengths. Eligibility is checked again at review and
                departure.
              </Text>
            )}
            {(targetProblem || attackWarning) && (
              <Text
                className={styles.destinationNotice}
                tone="danger"
                role="status"
              >
                {targetProblem || attackWarning}
              </Text>
            )}
          </fieldset>
          <fieldset className={styles.fieldset}>
            <legend>Ships</legend>
            {types.map((k) => {
              const available =
                body.inventories.find((i) => i.item.id === k)?.count ?? '0'
              return (
                <Field key={k}>
                  {label(k)} · {available} available
                  <Input
                    inputMode="numeric"
                    value={ships[k] ?? '0'}
                    placeholder="0"
                    onBlur={(e) => {
                      if (!e.target.value.trim())
                        setShips({ ...ships, [k]: '0' })
                    }}
                    onChange={(e) => {
                      setShips({ ...ships, [k]: e.target.value })
                      clear()
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      setShips({ ...ships, [k]: available })
                      clear()
                    }}
                  >
                    All {label(k)}
                  </Button>
                </Field>
              )
            })}
          </fieldset>
          <fieldset className={styles.cargoFields} aria-label="Cargo">
            <div className={styles.cargoHeader}>
              <span>Cargo</span>
            </div>
            <div className={styles.cargoInputs}>
              {resourceNames.map((resource, i) => (
                <Field
                  key={resource}
                  title={resource[0].toUpperCase() + resource.slice(1)}
                >
                  <ResourceMark resource={resource} />
                  <Input
                    aria-label={resource[0].toUpperCase() + resource.slice(1)}
                    inputMode="numeric"
                    value={cargo[i]}
                    placeholder="0"
                    onBlur={(e) => {
                      if (!e.target.value.trim())
                        setCargo(cargo.map((n, j) => (i === j ? '0' : n)))
                    }}
                    onChange={(e) => {
                      setCargo(
                        cargo.map((n, j) => (i === j ? e.target.value : n)),
                      )
                      clear()
                    }}
                  />
                </Field>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="small"
                disabled={busy || !coordinatesValid || !!targetProblem}
                title="Fill available cargo space, reserving deuterium for fuel"
                onClick={() => void addAllCargo()}
              >
                Add all
              </Button>
            </div>
          </fieldset>
          {error && (
            <Text tone="danger" role="alert">
              {error}
            </Text>
          )}
          <Button
            ref={reviewButtonRef}
            disabled={busy || !coordinatesValid || !!targetProblem}
          >
            {busy ? 'Reviewing…' : 'Review fleet'}
          </Button>
        </Form>
        <aside className={styles.dispatchAside} aria-label="Departure context">
          <Heading level={3}>
            Departing from{' '}
            <CoordinateLink at={body.coordinates} label="origin" />
          </Heading>
          <Text>
            Fleet slots: {occupiedSlots} / {view.missions.fleet_slots}.
            Returning fleets occupy a slot.
          </Text>
          <Text>
            Review checks the current destination, fuel, capacity and mission
            eligibility before you commit.
          </Text>
          <ButtonLink {...routeTarget(universeName, 'fleets', body.id)}>
            View fleet activity
          </ButtonLink>
        </aside>
      </div>
      {quote && (
        <QuotePanel
          as="section"
          aria-label="Fleet quote"
          tabIndex={-1}
          ref={quoteRef}
          className={styles.review}
        >
          <div className={styles.actions}>
            <Heading level={2}>Review dispatch</Heading>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setQuote(null)}
            >
              Edit mission
            </Button>
          </div>
          <Text>
            Origin {bodyName(body)}{' '}
            <CoordinateLink at={body.coordinates} label="origin" /> →
            Destination{' '}
            <CoordinateLink
              at={{
                galaxy: Number(galaxy),
                system: Number(system),
                position: Number(position),
              }}
              label="destination"
            />
          </Text>
          <Text>
            {quote.intent.ships
              .map((stack) => `${stack.count} ${label(stack.ship_type)}`)
              .join(' · ')}
          </Text>
          <Text>
            Cargo: <ResourceNumber value={quote.intent.cargo.metal} /> metal ·{' '}
            <ResourceNumber value={quote.intent.cargo.crystal} /> crystal ·{' '}
            <ResourceNumber value={quote.intent.cargo.deuterium} /> deuterium
          </Text>
          <Text>
            {quote.intent.mission} ·{' '}
            <NumberValue value={quote.duration_ms} divisor={1000} /> seconds one
            way · <ResourceNumber value={quote.fuel} /> deuterium fuel
          </Text>
          <Text>
            Estimated contact {exactTime(now + quote.duration_ms)} · Return if
            needed {exactTime(now + 2 * quote.duration_ms)}. Estimates assume
            departure now. Successful deployment and a colony with no remaining
            ships have no return leg.
          </Text>
          <Text>
            Payload capacity <ResourceNumber value={quote.capacity} /> · Maximum
            with fuel <ResourceNumber value={quote.maximum_payload} /> · Slot
            limit {quote.slot_limit}
          </Text>
          <Text>
            Fuel is spent once; recall does not refund it. Probes carry fuel
            only. Espionage can enter combat and never loots.
          </Text>
          <QuoteAction
            disabled={
              !command ||
              !canSubmitQuote(model.store.getState(), command, quote)
            }
            onClick={() => void send()}
          >
            Send {shipManifest(quote.intent.ships)}
          </QuoteAction>
        </QuotePanel>
      )}
    </Section>
  )
}
