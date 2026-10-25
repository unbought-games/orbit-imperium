import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { ButtonLink } from '../ui/button'
import { Link } from '../ui/link'
import { bodyName, coordinates, label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import { Heading, Text } from '../ui/typography'
import { unitCounts } from './progression/unit-counts'
import styles from './fleet-inventory.module.css'

export function FleetInventory({
  model,
  origin,
}: {
  model: Coordinator
  origin: string
}) {
  const universe = useUniverseName()
  // Inventory and queues must come from the same confirmed snapshot, not launch overlays.
  const view = useStore(model.store, (state) => state.view)
  if (!view || view.protocol === 2) return null
  const body = view.bodies.find((candidate) => candidate.id === origin)
  if (!body) return null
  const ships = view.catalog.filter((entry) => entry.key.kind === 'Ship')
  const empty = !body.inventories.some(
    (inventory) =>
      inventory.item.kind === 'Ship' && BigInt(inventory.count) > 0n,
  )
  return (
    <section aria-label="Stationed ships" className={styles.inventory}>
      <div className={styles.header}>
        <div>
          <Heading level={2}>Stationed ships</Heading>
          <Text>
            {bodyName(body)} {coordinates(body)}
          </Text>
        </div>
        <ButtonLink
          variant="secondary"
          {...routeTarget(universe, 'shipyard', body.id)}
        >
          Open Shipyard
        </ButtonLink>
      </div>
      <Text>
        Confirmed counts. Flying ships departed from this world, including
        returning fleets. Queued ships are still being built. Pending orders
        appear after confirmation.
      </Text>
      {empty && (
        <Text>
          No ships stationed here. Build your first ships in the Shipyard or
          wait for a fleet to return.
        </Text>
      )}
      <ul className={styles.ships}>
        {ships.map((entry) => {
          const counts = unitCounts(view, body, entry)
          const name = label(entry.key.id)
          return (
            <li key={entry.key.id} aria-label={name} className={styles.ship}>
              <Heading level={3}>{name}</Heading>
              <dl className={styles.counts}>
                <div>
                  <dt>Stationed</dt>
                  <dd>
                    <NumberValue value={counts.stationed} />
                  </dd>
                </div>
                <div>
                  <dt>Flying</dt>
                  <dd>
                    {counts.flying === null ? (
                      entry.mobile ? (
                        'Unknown'
                      ) : (
                        'Stationary'
                      )
                    ) : (
                      <NumberValue value={counts.flying} />
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Queued</dt>
                  <dd>
                    <NumberValue value={counts.ordered} />
                  </dd>
                </div>
              </dl>
              <Link
                {...routeTarget(universe, 'shipyard', body.id, entry.key.id)}
                aria-label={`Build more ${name} in Shipyard`}
                className={styles.build}
              >
                Build more in Shipyard
              </Link>
            </li>
          )
        })}
      </ul>
      {!ships.length && (
        <Text>
          Ship details are unavailable. Open the Shipyard to check this world's
          catalog.
        </Text>
      )}
    </section>
  )
}
