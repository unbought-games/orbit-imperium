import type { CatalogSelection } from '../shell/use-catalog-selection'
import { TaskHeader } from '../ui/task-header'
import { NumberValue, ResourceNumber } from '../ui/number-value'
import { canFundFleet } from '../client-model/resources'
import { pendingBody } from '../client-model/game-projection'
import styles from './operations.module.css'
import { QuotePanel, QuoteAction } from '../ui/quote-panel'
import { Button } from '../ui/button'
import { Field, Form, FormGrid, Input, Select } from '../ui/form'
import { Section } from '../ui/section'
import { Panel } from '../ui/panel'
import { Caption, Heading, Text } from '../ui/typography'
import type { Page } from '../shell/routes'
import { useCountdown } from '../client-model/use-clock'
import { useState, type FormEvent } from 'react'
import { type View } from '../adapters/http'
import { type Quote, type QuoteRequest } from '../client-model/commands'
import { useCommands } from '../client-model/use-commands'
import { Economy } from './construction'
import { MissionTrajectory } from './mission-trajectory'
import { exactTime } from './mission-presentation'
import missionStyles from './missions.module.css'
export type CommandActions = ReturnType<typeof useCommands> & { busy: boolean }
type TransportRequest = Extract<QuoteRequest, { type: 'Transport' }>

export function Operations({
  view,
  body,
  commands,
  selection,
  page = 'overview',
  item = null,
}: {
  view: View
  body: View['bodies'][number]
  commands: ReturnType<typeof useCommands>
  selection?: CatalogSelection
  page?: Page
  item?: string | null
}) {
  const busy = commands.model
    ? pendingBody(commands.model.store.getState(), body.id)
    : false
  const actions = { ...commands, busy }
  const countdown = useCountdown(view.sampled_at)
  return (
    <>
      {page === 'fleets' && <TaskHeader title="Fleets" />}
      {page === 'dispatch' && <TaskHeader title="Dispatch fleet" />}
      {['overview', 'resources'].includes(page) && (
        <Economy
          view={view}
          body={body}
          actions={actions}
          compact={page === 'resources'}
          selection={selection}
        />
      )}
      {['overview', 'dispatch'].includes(page) && !item && (
        <Transport view={view} body={body} actions={actions} />
      )}
      {['overview', 'fleets', 'dispatch'].includes(page) && (
        <>
          <Heading level={2}>Active fleets</Heading>
          {view.fleets.length === 0 ? (
            <Text>No fleets in flight.</Text>
          ) : (
            view.fleets
              .filter((f) => !item || f.id === item)
              .map((f) => (
                <Panel className={styles['fleet']} key={f.id}>
                  {view.destinations.find((entry) => entry.id === f.origin) && (
                    <MissionTrajectory
                      originIdentity={view.destinations.find(
                        (entry) => entry.id === f.origin,
                      )}
                      destinationIdentity={view.destinations.find(
                        (entry) => entry.id === f.target,
                      )}
                      origin={
                        view.destinations.find(
                          (entry) => entry.id === f.origin,
                        )!.coordinates
                      }
                      destination={
                        view.destinations.find((entry) => entry.id === f.target)
                          ?.coordinates
                      }
                      returning={f.status !== 'Outbound'}
                    />
                  )}
                  <div>
                    <Heading level={3}>
                      {f.status} ·{' '}
                      {f.ships.map((s) => `${s.count} Small Cargo`).join(', ')}
                    </Heading>
                    <Text>
                      {coordinates(view, f.origin)} →{' '}
                      {coordinates(view, f.target)} · {countdown(f.due_at)}
                      <br />
                      <time dateTime={new Date(f.due_at).toISOString()}>
                        {exactTime(f.due_at)}
                      </time>
                    </Text>
                    <Text className={styles.payload}>
                      On board: <ResourceNumber value={f.payload.metal} /> M ·{' '}
                      <ResourceNumber value={f.payload.crystal} /> C ·{' '}
                      <ResourceNumber value={f.payload.deuterium} /> D. Paid
                      fuel: <ResourceNumber value={f.paid_fuel} /> D.
                    </Text>
                  </div>
                  {f.status === 'Outbound' && (
                    <LegacyRecall fleet={f.id} actions={actions} />
                  )}
                </Panel>
              ))
          )}
        </>
      )}
      {page === 'fleets' && !item && (
        <Transport view={view} body={body} actions={actions} />
      )}
      {['overview', 'reports'].includes(page) && (
        <>
          <Heading level={2}>Recent reports</Heading>
          {view.reports_truncated && (
            <Text>Showing the newest 100 reports.</Text>
          )}
          {view.reports.length === 0 ? (
            <Text>No reports yet.</Text>
          ) : (
            <div className={styles['reports']}>
              {view.reports
                .filter((r) => !item || r.id === item)
                .map((r) => (
                  <Panel key={r.id}>
                    <Heading level={3}>
                      {r.kind.replace(/([a-z])([A-Z])/g, '$1 $2')}
                    </Heading>
                    <Text>
                      {coordinates(view, r.origin)} →{' '}
                      {coordinates(view, r.target)}
                    </Text>
                    <Text>
                      <ResourceNumber value={r.cargo.metal} /> metal ·{' '}
                      <ResourceNumber value={r.cargo.crystal} /> crystal ·{' '}
                      <ResourceNumber value={r.cargo.deuterium} /> deuterium
                    </Text>
                    <Caption>{new Date(r.at).toLocaleString()}</Caption>
                  </Panel>
                ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
function LegacyRecall({
  fleet,
  actions,
}: {
  fleet: string
  actions: CommandActions
}) {
  const [reviewing, setReviewing] = useState(false)
  const pending = actions.attempts.some(
    (attempt) =>
      !attempt.reconciled &&
      attempt.status !== 'rejected' &&
      attempt.envelope.command.type === 'RecallFleet' &&
      attempt.envelope.command.fleet === fleet,
  )
  return (
    <section aria-label="Recall transport" className={missionStyles.recall}>
      {reviewing && !pending ? (
        <>
          <Heading level={3}>Review recall</Heading>
          <Text>
            Fuel is not refunded. The return leg equals time already travelled.
            The server confirms the return time when it accepts recall; arrival
            may resolve first.
          </Text>
          <div className={missionStyles.actions}>
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Keep mission
            </Button>
            <Button
              onClick={() => {
                void actions.send({ type: 'RecallFleet', fleet })
                setReviewing(false)
              }}
            >
              Recall fleet
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => setReviewing(true)}
        >
          {pending ? 'Recall requested' : 'Review recall'}
        </Button>
      )}
    </section>
  )
}
function coordinates(view: View, id: string) {
  const d = [...view.bodies, ...view.destinations].find((d) => d.id === id)
  return d
    ? `${d.name ? `${d.name} ` : ''}[${d.coordinates.galaxy}:${d.coordinates.system}:${d.coordinates.position}]`
    : 'Unavailable body'
}
function Transport({
  view,
  body,
  actions,
}: {
  view: View
  body: View['bodies'][number]
  actions: CommandActions
}) {
  const availableCargo =
    body.inventories.find(
      (stack) => stack.item.kind === 'Ship' && stack.item.id === 'SmallCargo',
    )?.count ?? '0'
  const hasCargo = BigInt(availableCargo) > 0n
  const [proposal, setProposal] = useState<{
      request: TransportRequest
      quote: Quote
    } | null>(null),
    [error, setError] = useState('')
  async function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    try {
      setError('')
      const read = (name: string) => {
        const text = String(values.get(name))
        if (!/^[0-9]+$/.test(text))
          throw new Error('Use whole nonnegative quantities.')
        return (BigInt(text) * 1000000n).toString()
      }
      const request: TransportRequest = {
        type: 'Transport',
        origin: body.id,
        target: String(values.get('target')),
        ships: [
          {
            owner: view.binding.player,
            ship_type: 'SmallCargo',
            count: BigInt(String(values.get('count'))).toString(),
          },
        ],
        cargo: {
          metal: read('metal'),
          crystal: read('crystal'),
          deuterium: read('deuterium'),
        },
        speed_percent: Number(
          values.get('speed'),
        ) as TransportRequest['speed_percent'],
      }
      const quote = await actions.quote(request)
      if (quote) setProposal({ request, quote })
    } catch {
      setError(
        'Quote unavailable. Check whole-unit cargo, ships, destination and connection.',
      )
    }
  }
  return (
    <Section>
      <Heading level={2}>Send a transport</Heading>
      <Text>
        Small Cargos carry resources to another planet, then return. Fuel is
        paid once at launch.
      </Text>
      {view.destinations_truncated && (
        <Text>Destination preview: first 100 bodies.</Text>
      )}
      <Form
        data-analytics="preview_transport"
        onSubmit={(e) => void preview(e)}
      >
        <FormGrid>
          <Field>
            Destination
            <Select name="target" required>
              {view.destinations
                .filter((d) => d.id !== body.id && d.kind === 'Planet')
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {coordinates(view, d.id)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field>
            Small Cargo count
            <Input
              name="count"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={availableCargo}
              required
            />
          </Field>
          <Field>
            Flight speed
            <Select name="speed" defaultValue="100">
              {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map((n) => (
                <option key={n} value={n}>
                  {n}%
                </option>
              ))}
            </Select>
          </Field>
          {['metal', 'crystal', 'deuterium'].map((name) => (
            <Field key={name}>
              Cargo {name}
              <Input
                name={name}
                inputMode="numeric"
                pattern="[0-9]+"
                defaultValue="0"
                required
              />
            </Field>
          ))}
        </FormGrid>
        <Button disabled={actions.busy || !hasCargo}>
          Calculate transport
        </Button>
        {!hasCargo && (
          <Text>
            No Small Cargo ships are stationed here. Manufacturing is
            unavailable in this universe.
          </Text>
        )}
      </Form>
      {proposal && (
        <QuotePanel as="div" role="region" aria-label="Transport quote">
          <Heading level={3}>Confirm transport</Heading>
          <Text>
            <NumberValue value={proposal.quote.duration} divisor={1000} />{' '}
            seconds each way · <ResourceNumber value={proposal.quote.fuel} />{' '}
            deuterium fuel ·{' '}
            <ResourceNumber value={proposal.quote.maximum_payload} /> maximum
            payload
          </Text>
          <Text>
            Payload: <ResourceNumber value={proposal.request.cargo.metal} /> M ·{' '}
            <ResourceNumber value={proposal.request.cargo.crystal} /> C ·{' '}
            <ResourceNumber value={proposal.request.cargo.deuterium} /> D
          </Text>
          <QuoteAction
            disabled={
              actions.busy ||
              !canFundFleet(
                proposal.request.cargo,
                proposal.quote.fuel,
                body.amounts,
              )
            }
            onClick={() => {
              void actions.send(
                {
                  ...proposal.request,
                  type: 'LaunchTransport',
                  expected_terms_hash: proposal.quote.terms_hash,
                },
                proposal.quote,
              )
              setProposal(null)
            }}
          >
            Launch transport
          </QuoteAction>
          <QuoteAction onClick={() => setProposal(null)}>
            Dismiss transport quote
          </QuoteAction>
        </QuotePanel>
      )}
      {error && (
        <Text tone="danger" role="alert">
          {error}
        </Text>
      )}
    </Section>
  )
}
