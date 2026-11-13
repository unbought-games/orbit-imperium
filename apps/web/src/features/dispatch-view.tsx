import { DispatchLoot } from './dispatch-loot'
import {
  DispatchCargoControls,
  DispatchFlightControls,
} from './dispatch-controls'
import { RichSelect } from '../ui/rich-select'
import { BodyIllustration } from './body-illustration'
import { PlayerName } from './player-name'
import {
  LocationSummary,
  LocationSummaryMedia,
  LocationSummaryContent,
  LocationSummaryLabel,
  LocationSummaryTitle,
  LocationSummaryDescription,
  LocationSummaryCoordinates,
} from '../ui/location-summary'
import { DispatchShips } from './dispatch-ships'
import { DispatchDestinationPreview } from './dispatch-destination-preview'
import { CoordinateLink } from './coordinate-link'
import { coordinateText, type LocationKind } from '../shell/location-address'
import { DispatchReview } from './dispatch-review'
import type { useDispatch } from './use-dispatch'
import type { DispatchDraft } from './missions'
import { canSubmitQuote } from '../client-model/game-projection'
import { Button, ButtonLink } from '../ui/button'
import { ArrowLeft } from 'lucide-react'
import { FleetSlots } from './fleet-slots'
import { routeTarget } from '../shell/route-target'
import { MissionSelector } from './mission-selector'
import { Field } from '../ui/form'
import { Form } from '../ui/form'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import styles from './missions.module.css'
import { TaskHeader } from '../ui/task-header'
import { DispatchFeedback } from './dispatch-feedback'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { bodyName } from '../ui/format'
type S = components['schemas']
export type DispatchViewProps = {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  draft: DispatchDraft | null
  universeName: string
  occupiedSlots: number
  recentlyCopied: { coordinates: S['Coordinates']; target: LocationKind } | null
  dispatch: ReturnType<typeof useDispatch>
}

/** Feature presentation: session acquisition belongs to the route adapter. */
export function DispatchView({
  model,
  view,
  body,
  draft,
  universeName,
  occupiedSlots,
  recentlyCopied,
  dispatch,
}: DispatchViewProps) {
  const {
    site,
    siteId,
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
    holdHours,
    setHoldHours,
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
    cargoCapacity,
    cargoCapacityMessage,
    setCargo,
    addAllCargo,
    maxCargo,
    quote,
    setQuote,
    error,
    busy,
    now,
    types,
    hasShips,
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
  } = dispatch
  return (
    <Section className={styles.screen}>
      <header className={styles.dispatchHeader} aria-label="Dispatch header">
        <div className={styles.dispatchTitle}>
          {quote ? (
            <Button
              type="button"
              variant="secondary"
              size="icon-small"
              aria-label="Back to edit mission"
              title="Back to edit mission"
              onClick={() => setQuote(null)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Button>
          ) : (
            <ButtonLink
              variant="secondary"
              size="icon-small"
              aria-label="Back to fleets"
              title="Back to fleets"
              {...routeTarget(universeName, 'fleets', body.id)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </ButtonLink>
          )}
          <Heading level={2} className={styles.dispatchHeading}>
            Dispatch
          </Heading>
        </div>
        <div className={styles.dispatchHeaderActions}>
          <FleetSlots used={occupiedSlots} total={view.missions.fleet_slots} />
        </div>
      </header>
      {!quote && (
        <>
          {draft?.attackGroup && (
            <Text role="status">
              Joining an alliance attack. Your fleet must arrive within 130% of
              the group’s remaining flight time. Review the shared arrival
              before launching.
            </Text>
          )}
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
                    <PlayerName player={view.binding.player} fallback="You" />
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
        </>
      )}
      <div className={styles.dispatchLayout} hidden={!!quote}>
        <Form
          onSubmit={(e) => {
            e.preventDefault()
            if (hasShips) void review()
          }}
        >
          <fieldset
            className={styles.destinationFields}
            aria-label="Mission and destination"
          >
            <MissionSelector
              value={mission}
              available={
                draft?.attackGroup || siteId
                  ? ['Attack']
                  : view.capabilities
                      .filter((c) => c.enabled)
                      .map((c) => c.capability)
              }
              onChange={(nextMission) => {
                setMission(nextMission)
                if (nextMission === 'Harvest') setTargetKind('debris')
                else if (targetKind === 'debris' || nextMission === 'Colonize')
                  setTargetKind('planet')
                clear()
              }}
            />
            {mission === 'Hold' && (
              <Field>
                Holding duration
                <RichSelect
                  label="Holding duration"
                  appearance="field"
                  value={String(holdHours)}
                  onValueChange={(value) => {
                    setHoldHours(
                      Number(value) as NonNullable<
                        S['FleetIntent4']['hold_hours']
                      >,
                    )
                    clear()
                  }}
                  options={[0, 1, 2, 4, 8, 16, 32].map((h) => ({
                    value: String(h),
                    label:
                      h === 0
                        ? 'Round trip · no defense'
                        : `${h} ${h === 1 ? 'hour' : 'hours'}`,
                    content:
                      h === 0
                        ? 'Round trip · no defense'
                        : `${h} ${h === 1 ? 'hour' : 'hours'}`,
                  }))}
                >
                  {holdHours === 0
                    ? 'Round trip · no defense'
                    : `${holdHours} ${holdHours === 1 ? 'hour' : 'hours'}`}
                </RichSelect>
                <Text>
                  Real hours. Fuel is prepaid and not refunded. Your ships and
                  cargo remain yours.
                </Text>
              </Field>
            )}
            {siteId ? (
              <section aria-label="Personal site destination">
                <Heading level={3}>
                  {site?.title ?? 'Personal introductory site'}
                </Heading>
                <Text>
                  Personal site · [
                  {coordinateText(
                    site?.site.destination.coordinates ?? draft!.coordinates,
                  )}
                  ]
                </Text>
                <Text>
                  Stockpile loot travels aboard surviving ships. Site-local
                  debris cannot be collected.
                </Text>
                <ButtonLink
                  variant="secondary"
                  {...routeTarget(
                    universeName,
                    'overview',
                    view.homeworld_id ?? body.id,
                  )}
                >
                  Return to guidance
                </ButtonLink>
              </section>
            ) : (
              <DispatchDestinationPreview
                readOnly={!!draft?.attackGroup}
                coordinates={destinationCoordinates}
                kind={targetKind}
                target={target}
                lookup={destination.lookup}
                player={view.binding.player}
                playerNames={playerNames}
                value={destinationText}
                universe={universeName}
                error={Object.values(coordinateProblems).find(Boolean)}
                bodies={
                  mission === 'Transport' || mission === 'Deploy'
                    ? destination.bodies
                    : undefined
                }
                selectedBody={destination.selectedBody?.id}
                onSelectBody={(id) => {
                  const planet = destination.bodies.find(
                    (candidate) => candidate.id === id,
                  )
                  if (!planet) return
                  setDestinationText(coordinateText(planet.coordinates))
                  setTargetKind(planet.kind === 'Moon' ? 'moon' : 'planet')
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
            )}
            {recentlyCopied && !draft?.attackGroup && !siteId && (
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
            key={body.id}
            view={view}
            body={body}
            types={types}
            ships={ships}
            onNormalize={(id) => setShips({ ...ships, [id]: '0' })}
            onAddAll={(allShips) => {
              setShips(allShips)
              clear()
            }}
            onChange={(id, value) => {
              setShips({ ...ships, [id]: value })
              clear()
            }}
          />
          <DispatchCargoControls
            cargo={cargo}
            space={cargoCapacity}
            message={cargoCapacityMessage}
            disabled={busy || !coordinatesValid || !!targetProblem || !hasShips}
            onNormalize={setCargo}
            onChange={(cargo) => {
              setCargo(cargo)
              clear()
            }}
            onFill={(resource) => {
              if (resource === 'all') void addAllCargo()
              else void maxCargo(resource)
            }}
          />
          {!quote && mission === 'Attack' && !siteId && (
            <DispatchLoot
              model={model}
              target={target}
              revision={view.viewer_revision}
              space={cargoCapacity}
              hasShips={hasShips}
              universeName={universeName}
              origin={body.id}
            />
          )}
          <DispatchFlightControls
            speed={speed}
            onChange={(speed) => {
              setSpeed(speed)
              clear()
            }}
            timing={{
              holdingMs: mission === 'Hold' ? holdHours * 3600000 : 0,
              terms: timing,
              availableFuel: body.amounts.deuterium,
              mission,
              now,
              message: timingMessage,
            }}
          />
          {error && (
            <Text tone="danger" role="alert">
              {error}
            </Text>
          )}
          {siteId && (targetProblem || error) && (
            <div className={styles.actions}>
              <ButtonLink
                variant="secondary"
                {...routeTarget(universeName, 'fleets', body.id)}
              >
                View fleets
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                {...routeTarget(universeName, 'shipyard', body.id)}
              >
                Open Shipyard
              </ButtonLink>
              <ButtonLink
                variant="secondary"
                {...routeTarget(
                  universeName,
                  'resources',
                  body.id,
                  'DeuteriumSynthesizer',
                )}
              >
                Develop fuel production
              </ButtonLink>
            </div>
          )}
          <DispatchFeedback
            model={model}
            attempt={submittedAttempt}
            destination={submittedCoordinates}
            origin={body.id}
          />
          <Button
            ref={reviewButtonRef}
            disabled={busy || !coordinatesValid || !!targetProblem || !hasShips}
          >
            {busy ? 'Reviewing…' : 'Review fleet'}
          </Button>
        </Form>
      </div>
      {quote && (
        <DispatchReview
          site={site}
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
          raidPlanning={
            mission === 'Attack' && !siteId ? (
              <DispatchLoot
                model={model}
                target={
                  quote.intent.destination.type === 'Body'
                    ? {
                        id: quote.intent.destination.id,
                        owner: quote.intent.destination.expected_owner,
                        kind: quote.intent.destination.expected_kind,
                      }
                    : target
                }
                revision={view.viewer_revision}
                space={cargoCapacity}
                hasShips={hasShips}
                universeName={universeName}
                origin={body.id}
              />
            ) : undefined
          }
          colonyWarning={
            colony.reason ??
            (colony.count >= colony.capacity ? colony.warning : undefined)
          }
          panelRef={quoteRef}
          onSend={() => void send()}
          disabled={
            !command || !canSubmitQuote(model.store.getState(), command, quote)
          }
        />
      )}
    </Section>
  )
}
