import { Fragment } from 'react'
import { shipGroup } from './ship-order'
import { CoordinateLink } from './coordinate-link'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { ButtonLink } from '../ui/button'
import { Link } from '../ui/link'
import { bodyName, label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import { Heading, Text } from '../ui/typography'
import { fleetInventoryRows } from './fleet-inventory-model'
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
  const ships = fleetInventoryRows(view, body)
  const hasCatalog = view.catalog.some((entry) => entry.key.kind === 'Ship')
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
            {bodyName(body)}{' '}
            <CoordinateLink
              at={body.coordinates}
              target={body.kind === 'Moon' ? 'moon' : 'planet'}
            />
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
      {ships.length > 0 && (
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Ship inventory table"
          tabIndex={0}
        >
          <table className={styles.ships} aria-label="Ship inventory">
            <thead>
              <tr>
                <th scope="col">Ship</th>
                <th scope="col">Stationed</th>
                <th scope="col">Flying</th>
                <th scope="col">Queued</th>
              </tr>
            </thead>
            <tbody>
              {ships.map(({ entry, counts }, index) => {
                const name = label(entry.key.id)
                return (
                  <Fragment key={entry.key.id}>
                    {(index === 0 ||
                      shipGroup(ships[index - 1].entry) !==
                        shipGroup(entry)) && (
                      <tr className={styles.group}>
                        <th scope="rowgroup" role="rowheader" colSpan={4}>
                          {shipGroup(entry)}
                        </th>
                      </tr>
                    )}
                    <tr>
                      <th scope="row">
                        <Link
                          data-touch-control=""
                          {...routeTarget(
                            universe,
                            'shipyard',
                            body.id,
                            entry.key.id,
                          )}
                          aria-label={`Build more ${name} in Shipyard`}
                          title={`Build more ${name} in Shipyard`}
                          className={styles.build}
                        >
                          {name}
                        </Link>
                      </th>
                      <td>
                        <NumberValue value={counts.stationed} />
                      </td>
                      <td>
                        {counts.flying === null ? (
                          entry.mobile ? (
                            'Unknown'
                          ) : (
                            '—'
                          )
                        ) : (
                          <NumberValue value={counts.flying} />
                        )}
                        {counts.flying === null && !entry.mobile && (
                          <span className={styles.srOnly}>Stationary</span>
                        )}
                      </td>
                      <td>
                        <NumberValue value={counts.ordered} />
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasCatalog && (
        <Text>
          Ship types with no stationed, flying or queued ships are hidden.
          Select a ship to open it in the Shipyard.
        </Text>
      )}
      {!hasCatalog && (
        <Text>
          Ship details are unavailable. Open the Shipyard to check this world's
          catalog.
        </Text>
      )}
    </section>
  )
}
