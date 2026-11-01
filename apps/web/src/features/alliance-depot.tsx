import { useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { Button } from '../ui/button'
import { Field, NumberInput } from '../ui/form'
import { Heading, Text } from '../ui/typography'
import { ResourceQuantity, DurationValue } from '../ui/number-value'
import { PlayerName } from './player-name'
import { ShipComposition } from './ship-composition'
import { useDepotSupply } from './use-depot-supply'
import { exactTime } from './mission-presentation'
import { bodyName } from '../ui/format'
import styles from './alliance-depot.module.css'
type S = components['schemas']
function SupplyForm({
  model,
  body,
  fleet,
}: {
  model: Coordinator
  body: string
  fleet: string
}) {
  const action = useDepotSupply(model, body, fleet)
  return (
    <div className={styles.form}>
      {!action.committed && (
        <Field>
          Deuterium to supply
          <NumberInput
            aria-label="Deuterium to supply"
            value={action.amount}
            disabled={action.busy || action.committed}
            onChange={(e) => action.setAmount(e.target.value)}
          />
        </Field>
      )}
      {!action.valid && (
        <Text role="alert">Enter a positive whole amount of deuterium.</Text>
      )}
      {action.quote && !action.committed && (
        <dl className={styles.facts}>
          <div>
            <dt>Spend now</dt>
            <dd>
              <ResourceQuantity
                resource="deuterium"
                value={action.quote.intent.deuterium}
              />
            </dd>
          </div>
          <div>
            <dt>Additional defense</dt>
            <dd>
              <DurationValue milliseconds={action.quote.extension_ms} />
            </dd>
          </div>
          <div>
            <dt>New departure</dt>
            <dd>{exactTime(action.quote.departure_at)}</dd>
          </div>
          <div>
            <dt>Budget after supply</dt>
            <dd>
              <ResourceQuantity
                resource="deuterium"
                value={(
                  BigInt(action.quote.remaining_budget) -
                  BigInt(action.quote.intent.deuterium)
                ).toString()}
              />
            </dd>
          </div>
        </dl>
      )}
      <Text>
        Supply is spent immediately and is not refunded. The fleet owner can
        still recall.
      </Text>
      {action.error && <Text role="alert">{action.error}</Text>}
      {action.committed ? (
        <>
          <Text role="status">
            Supply delivered. The fleet’s departure has been extended.
          </Text>
          <Button variant="secondary" onClick={action.reset}>
            Supply again
          </Button>
        </>
      ) : (
        <Button
          disabled={action.busy || !action.valid || !action.canSubmit}
          onClick={() => void action.perform()}
        >
          {action.busy
            ? 'Confirming…'
            : action.quote
              ? 'Supply deuterium'
              : 'Review supply'}
        </Button>
      )}
      {action.uncertain && (
        <Button variant="secondary" onClick={() => void action.recover()}>
          Check supply status
        </Button>
      )}
    </div>
  )
}
export function AllianceDepot({
  model,
  view,
  body,
  showEmpty = false,
}: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  showEmpty?: boolean
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const fleets = (view.holdings ?? []).filter((f) => f.target === body.id)
  const depot = view.depots?.find((d) => d.body === body.id)
  const level = body.levels.AllianceDepot ?? 0
  const enabled = view.catalog.some(
    (e) =>
      e.key.kind === 'Building' && e.key.id === 'AllianceDepot' && e.enabled,
  )
  if (!showEmpty && !fleets.length) return null
  return (
    <section className={styles.section} aria-label="Allied defense">
      <Heading level={2}>Allied defense</Heading>
      <Text>
        {bodyName(body)} ·{' '}
        {level > 0 ? `Alliance Depot level ${level}` : 'No Alliance Depot'}
      </Text>
      {depot && level > 0 && (
        <Text>
          Available this rolling hour:{' '}
          <ResourceQuantity
            resource="deuterium"
            value={depot.remaining_budget}
          />
          {depot.next_budget_release_at !== null && (
            <>
              {' '}
              · Next budget release {exactTime(depot.next_budget_release_at)}
            </>
          )}
        </Text>
      )}
      {fleets.length === 0 ? (
        <Text>
          No allied fleets are holding here. Allies and accepted friends can
          send a Hold mission without a Depot.
        </Text>
      ) : (
        <div className={styles.list}>
          {fleets.map((fleet) => (
            <article className={styles.fleet} key={fleet.id}>
              <header>
                <Heading level={3}>
                  <PlayerName player={fleet.owner} names={view.player_names} />{' '}
                  · Defending
                </Heading>
                <span>Departs {exactTime(fleet.departure_at)}</span>
              </header>
              <ShipComposition ships={fleet.ships} />
              {!enabled || level === 0 ? (
                <Text>
                  Build an Alliance Depot to extend this fleet’s defense.
                </Text>
              ) : !fleet.can_supply ? (
                <Text>
                  This fleet cannot currently receive supply. An active alliance
                  or friendship is required.
                </Text>
              ) : selected === fleet.id ? (
                <SupplyForm
                  key={fleet.id}
                  model={model}
                  body={body.id}
                  fleet={fleet.id}
                />
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => setSelected(fleet.id)}
                >
                  Supply fleet
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
