import { BodyIllustration } from './body-illustration'
import { playerLabel } from './player-label'
import {
  LocationSummary,
  LocationSummaryMedia,
  LocationSummaryContent,
  LocationSummaryLabel,
  LocationSummaryTitle,
  LocationSummaryDescription,
  LocationSummaryCoordinates,
} from '../ui/location-summary'
import { RangeInput } from '../ui/form'
import { DispatchShips } from './dispatch-ships'
import { DispatchDestinationPreview } from './dispatch-destination-preview'
import { CoordinateLink } from './coordinate-link'
import { ArrowUp } from 'lucide-react'
import { useAtomValue } from 'jotai'
import { copiedLocationAtom } from './coordinate-memory'
import { coordinateText, type LocationKind } from '../shell/location-address'
import { useUniverseName } from '../shell/session-context'
import { DispatchReview } from './dispatch-review'
import { useDispatch } from './use-dispatch'
import { canSubmitQuote } from '../client-model/game-projection'
import { Button } from '../ui/button'
import { NumberInput } from '../ui/form'
import { ResourceMark } from '../ui/resource-mark'
import { resourceNames } from '../client-model/resources'
import { MissionSelector } from './mission-selector'
import { Field } from '../ui/form'
import { Form } from '../ui/form'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import styles from './missions.module.css'
import { TaskHeader } from '../ui/task-header'
import { DispatchTiming } from './dispatch-timing'
import { DispatchFeedback } from './dispatch-feedback'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { bodyName } from '../ui/format'
type S = components['schemas']
export type DispatchDraft = {
  ships?: Record<string, string>
  speed?: number
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
  const {
    coordinateProblems,
    coordinatesValid,
    galaxy,
    system,
    position,
    targetProblem,
    attackWarning,
    mission,
    colony,
    setMission,
    destinationText,
    setDestinationText,
    targetKind,
    setTargetKind,
    destination,
    destinationCoordinates,
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
            <div className={styles.origin}>
              <LocationSummaryLabel>Origin</LocationSummaryLabel>
              <LocationSummary role="group" aria-label="Origin">
                <LocationSummaryMedia>
                  <BodyIllustration
                    body={body}
                    className={styles.originArt}
                    sizes="(max-width: 479px) 56px, 80px"
                  />
                </LocationSummaryMedia>
                <LocationSummaryContent>
                  <LocationSummaryTitle title={bodyName(body)}>
                    {bodyName(body)}
                  </LocationSummaryTitle>
                  <LocationSummaryDescription>
                    {body.kind} ·{' '}
                    {playerLabel(view.binding.player, view.player_names)}
                  </LocationSummaryDescription>
                  <LocationSummaryCoordinates>
                    <CoordinateLink
                      at={body.coordinates}
                      target={body.kind === 'Moon' ? 'moon' : 'planet'}
                      label="origin"
                    />
                  </LocationSummaryCoordinates>
                </LocationSummaryContent>
              </LocationSummary>
            </div>
          </TaskHeader>
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
              planet or moon and credits half the paid fuel, rounded down.
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
            <MissionSelector
              value={mission}
              available={view.capabilities
                .filter((c) => c.enabled)
                .map((c) => c.capability)}
              onChange={(nextMission) => {
                setMission(nextMission)
                if (nextMission === 'Harvest') setTargetKind('debris')
                else if (targetKind === 'debris' || nextMission === 'Colonize')
                  setTargetKind('planet')
                clear()
              }}
            />
            <DispatchDestinationPreview
              coordinates={destinationCoordinates}
              kind={targetKind}
              target={target}
              lookup={destination.lookup}
              refreshing={destination.refreshing}
              player={view.binding.player}
              playerNames={playerNames}
              value={destinationText}
              universe={universeName}
              error={Object.values(coordinateProblems).find(Boolean)}
              planets={
                mission === 'Transport' || mission === 'Deploy'
                  ? destination.planets
                  : undefined
              }
              selectedPlanet={destination.selectedPlanet?.id}
              onSelectPlanet={(id) => {
                const planet = destination.planets.find(
                  (candidate) => candidate.id === id,
                )
                if (!planet) return
                setDestinationText(coordinateText(planet.coordinates))
                setTargetKind('planet')
                clear()
              }}
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
          <DispatchShips
            view={view}
            body={body}
            types={types}
            ships={ships}
            onNormalize={(id) => setShips({ ...ships, [id]: '0' })}
            onChange={(id, value) => {
              setShips({ ...ships, [id]: value })
              clear()
            }}
          />
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
              <span className={styles.speedLabel}>
                Speed <span aria-hidden="true">{speed}%</span>
              </span>
              <RangeInput
                aria-label="Speed"
                aria-valuetext={`${speed}%`}
                min={10}
                max={100}
                step={10}
                value={speed}
                onChange={(e) => {
                  setSpeed(Number(e.target.value))
                  clear()
                }}
              />
            </Field>
            <DispatchTiming
              terms={timing}
              availableFuel={body.amounts.deuterium}
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
