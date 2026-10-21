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
import { Select } from '../ui/form'
import { Field } from '../ui/form'
import { Form } from '../ui/form'
import { Section } from '../ui/section'
import { Text } from '../ui/typography'
import { Heading } from '../ui/typography'
import styles from './missions.module.css'
import { exactTime, shipManifest } from './mission-presentation'
import { MissionTrajectory } from './mission-trajectory'
import { DispatchReceipt } from './dispatch-receipt'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { routeTarget } from '../shell/route-target'
import { label } from '../ui/format'
type S = components['schemas']
export type DispatchDraft = {
  coordinates: S['Coordinates']
  mission: 'Transport' | 'Espionage' | 'Harvest' | 'Attack'
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
  const occupiedSlots = useStore(model.store, occupiedFleetSlots)
  const {
    mission,
    setMission,
    galaxy,
    setGalaxy,
    system,
    setSystem,
    position,
    setPosition,
    speed,
    setSpeed,
    ships,
    setShips,
    cargo,
    setCargo,
    quote,
    setQuote,
    error,
    busy,
    now,
    types,
    quoteRef,
    reviewButtonRef,
    command,
    clear,
    review,
  } = useDispatch({ model, view, body, draft })
  return (
    <Section className={styles.screen}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Prepare a departure</p>
        <Heading level={2} className={styles.title}>
          Set your course.
        </Heading>
        <Text>Choose the mission, review its terms, then send your fleet.</Text>
      </header>
      <Text className={styles.origin}>
        Origin: [{body.coordinates.galaxy}:{body.coordinates.system}:
        {body.coordinates.position}]. Surviving ships return on their committed
        one-way travel duration after contact.
      </Text>
      <Text>
        {view.capabilities.some((c) => c.capability === 'Attack' && c.enabled)
          ? 'Attack victories can plunder resources into surviving cargo space.'
          : 'Attack is unavailable in this universe.'}{' '}
        Colonization and deployment are unavailable.
      </Text>
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
          <fieldset className={styles.fieldset}>
            <legend>Mission and destination</legend>
            <Field>
              Mission
              <Select
                value={mission}
                onChange={(e) => {
                  setMission(e.target.value as DispatchDraft['mission'])
                  clear()
                }}
              >
                {(['Transport', 'Espionage', 'Harvest', 'Attack'] as const)
                  .filter((m) =>
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
              Galaxy
              <Input
                inputMode="numeric"
                value={galaxy}
                onChange={(e) => {
                  setGalaxy(e.target.value)
                  clear()
                }}
              />
            </Field>
            <Field>
              System
              <Input
                inputMode="numeric"
                value={system}
                onChange={(e) => {
                  setSystem(e.target.value)
                  clear()
                }}
              />
            </Field>
            <Field>
              Position
              <Input
                inputMode="numeric"
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value)
                  clear()
                }}
              />
            </Field>
            <Field>
              Speed
              <Select
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
          <fieldset className={styles.fieldset}>
            <legend>Cargo</legend>
            {['Metal', 'Crystal', 'Deuterium'].map((k, i) => (
              <Field key={k}>
                {k}
                <Input
                  inputMode="numeric"
                  value={cargo[i]}
                  onChange={(e) => {
                    setCargo(
                      cargo.map((n, j) => (i === j ? e.target.value : n)),
                    )
                    clear()
                  }}
                />
              </Field>
            ))}
          </fieldset>
          <Button ref={reviewButtonRef} disabled={busy}>
            {busy ? 'Reviewing…' : 'Review fleet'}
          </Button>
        </Form>
        <aside className={styles.dispatchAside} aria-label="Departure context">
          <MissionTrajectory origin={body.coordinates} originIdentity={body} />
          <Heading level={3}>
            Departing from [{body.coordinates.galaxy}:{body.coordinates.system}:
            {body.coordinates.position}]
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
      <DispatchReceipt model={model} origin={body.id} />
      {error && (
        <Text tone="danger" role="alert">
          {error}
        </Text>
      )}
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
              variant="quiet"
              onClick={() => setQuote(null)}
            >
              Edit mission
            </Button>
          </div>
          <MissionTrajectory
            origin={body.coordinates}
            originIdentity={body}
            destinationIdentity={
              quote.intent.destination.type === 'Body'
                ? {
                    id: quote.intent.destination.id,
                    kind: quote.intent.destination.expected_kind,
                  }
                : {
                    id: quote.intent.destination.field_identity,
                    kind: 'Debris',
                  }
            }
            destination={{
              galaxy: Number(galaxy),
              system: Number(system),
              position: Number(position),
            }}
          />
          <Text>
            Origin [{body.coordinates.galaxy}:{body.coordinates.system}:
            {body.coordinates.position}] → Destination [{galaxy}:{system}:
            {position}]
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
            Estimated contact {exactTime(now + quote.duration_ms)} · Estimated
            return {exactTime(now + 2 * quote.duration_ms)}. Estimates assume
            departure now; losses may leave no return fleet.
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
            onClick={() => {
              if (
                !command ||
                !canSubmitQuote(model.store.getState(), command, quote)
              )
                return
              void model.send(command, quote)
              setQuote(null)
            }}
          >
            Send {shipManifest(quote.intent.ships)}
          </QuoteAction>
        </QuotePanel>
      )}
    </Section>
  )
}
