import { CoordinateLink } from './coordinate-link'
import { ArrowUp } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { copiedLocationAtom } from './coordinate-memory'
import { CoordinateInput } from '../ui/coordinate-input'
import { coordinateText, type LocationKind } from '../shell/location-address'
import { useUniverseName } from '../shell/session-context'
import { DispatchReview } from './dispatch-review'
import { useStore } from 'zustand'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { useDispatch } from './use-dispatch'
import { canSubmitQuote } from '../client-model/game-projection'
import { ButtonLink } from '../ui/button'
import { Button } from '../ui/button'
import { NumberInput } from '../ui/form'
import { ResourceMark } from '../ui/resource-mark'
import { resourceNames } from '../client-model/resources'
import { Select } from '../ui/form'
import { Field } from '../ui/form'
import { Form } from '../ui/form'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Heading } from '../ui/typography'
import styles from './missions.module.css'
import { TaskHeader } from '../ui/task-header'
import { DispatchTiming } from './dispatch-timing'
import { DispatchFeedback } from './dispatch-feedback'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { bodyName, label } from '../ui/format'
type S = components['schemas']
export type DispatchDraft = {
  origin?: string
  targetKind?: LocationKind
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
  const recentlyCopied = useAtomValue(copiedLocationAtom)
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
    system,
    position,
    destinationText,
    setDestinationText,
    targetKind,
    setTargetKind,
    destinationDescription,
    speed,
    setSpeed,
    ships,
    setShips,
    cargo,
    setCargo,
    addAllCargo,
    maxCargo,
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
    target,
    playerNames,
    timing,
    timingMessage,
    submittedAttempt,
    submittedCoordinates,
  } = useDispatch({ model, view, body, draft })
  return (
    <Section className={styles.screen}>
      {!quote && (
        <>
          <TaskHeader>
            <span>
              Origin {bodyName(body)}{' '}
              <CoordinateLink at={body.coordinates} label="origin" /> · Fleet
              slots: {occupiedSlots} / {view.missions.fleet_slots}
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
              {colony.reason ?? colony.warning} Requires at least one Colony
              Ship.
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
        </>
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
                  if (e.target.value === 'Harvest') setTargetKind('debris')
                  else if (
                    targetKind === 'debris' ||
                    e.target.value === 'Colonize'
                  )
                    setTargetKind('planet')
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
            <CoordinateInput
              value={destinationText}
              universe={universeName}
              error={Object.values(coordinateProblems).find(Boolean)}
              onChange={(text, kind) => {
                setDestinationText(text)
                if (kind) {
                  setTargetKind(kind)
                  if (kind === 'debris') setMission('Harvest')
                  else if (mission === 'Harvest') setMission('Transport')
                }
                clear()
              }}
            />
            <Field>
              Target
              <Select
                aria-label="Destination type"
                value={targetKind}
                onChange={(event) => {
                  const kind = event.target.value as LocationKind
                  setTargetKind(kind)
                  if (kind === 'debris') setMission('Harvest')
                  else if (mission === 'Harvest') setMission('Transport')
                  clear()
                }}
              >
                <option value="planet">Planet</option>
                <option value="moon">Moon</option>
                <option value="debris">Debris field</option>
              </Select>
            </Field>
            {coordinatesValid && (
              <Text role="status">
                {targetKind === 'debris'
                  ? 'Debris field'
                  : destinationDescription}
              </Text>
            )}
            {recentlyCopied && (
              <Text>
                Recently copied in game: [
                {coordinateText(recentlyCopied.coordinates)}]{' '}
                <Button
                  type="button"
                  onClick={() => {
                    setDestinationText(
                      coordinateText(recentlyCopied.coordinates),
                    )
                    setTargetKind(recentlyCopied.target)
                    if (recentlyCopied.target === 'debris')
                      setMission('Harvest')
                    else if (mission === 'Harvest') setMission('Transport')
                    clear()
                  }}
                >
                  Use destination
                </Button>
              </Text>
            )}
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
                  <NumberInput
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
                <div className={styles.cargoInput} key={resource}>
                  <Field title={resource[0].toUpperCase() + resource.slice(1)}>
                    <ResourceMark resource={resource} />
                    <NumberInput
                      aria-label={resource[0].toUpperCase() + resource.slice(1)}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-small"
                    className={styles.maxCargo}
                    aria-label={`Max ${resource}`}
                    title={`Max ${resource}, reserving space for other cargo and fuel`}
                    disabled={busy || !coordinatesValid || !!targetProblem}
                    onClick={() => void maxCargo(resource)}
                  >
                    <ArrowUp size={18} aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="small"
                disabled={busy || !coordinatesValid || !!targetProblem}
                title="Keep entered cargo and split remaining space evenly, reserving deuterium for fuel"
                onClick={() => void addAllCargo()}
              >
                Add all
              </Button>
            </div>
          </fieldset>
          <fieldset
            className={styles.flightSettings}
            aria-label="Speed and flight estimates"
          >
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
            <DispatchTiming
              terms={timing}
              mission={mission}
              now={now}
              message={timingMessage}
            />
          </fieldset>
          {error && (
            <Text tone="danger" role="alert">
              {error}
            </Text>
          )}
          <DispatchFeedback
            model={model}
            attempt={submittedAttempt}
            destination={submittedCoordinates}
            origin={body.id}
          />
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
        <DispatchReview
          quote={quote}
          body={body}
          view={view}
          target={target}
          playerNames={playerNames}
          coordinates={{
            galaxy: Number(galaxy),
            system: Number(system),
            position: Number(position),
          }}
          occupiedSlots={occupiedSlots}
          now={now}
          observedAt={draft?.observedAt}
          colonyWarning={
            colony.reason ??
            (colony.count >= colony.capacity ? colony.warning : undefined)
          }
          panelRef={quoteRef}
          onEdit={() => setQuote(null)}
          onSend={() => void send()}
          disabled={
            !command || !canSubmitQuote(model.store.getState(), command, quote)
          }
        />
      )}
    </Section>
  )
}
