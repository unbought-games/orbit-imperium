import { Fragment, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { InfoTooltip } from '../ui/info-tooltip'
import { shipGroup } from './ship-order'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { useUniverseName } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { Link } from '../ui/link'
import { resolveCatalogArt } from '../ui/artwork'
import { label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import { Text } from '../ui/typography'
import { SegmentedControl } from '../ui/segmented-control'
import {
  fleetInventoryRows,
  type FleetInventoryScope,
} from './fleet-inventory-model'
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
  return <FleetInventoryView view={view} origin={origin} universe={universe} />
}

/** Confirmed snapshot presentation, independent of session and transport lifetime. */
export function FleetInventoryView({
  view,
  origin,
  universe,
}: {
  view: Parameters<typeof fleetInventoryRows>[0]
  origin: string
  universe: string
}) {
  const [scope, setScope] = useState<FleetInventoryScope>('world')
  const empire = scope === 'empire'
  const body = view.bodies.find((candidate) => candidate.id === origin)
  if (!body) return null
  const ships = fleetInventoryRows(view, body, scope)
  const hasCatalog = view.catalog.some((entry) => entry.key.kind === 'Ship')
  const empty = !body.inventories.some(
    (inventory) =>
      inventory.item.kind === 'Ship' && BigInt(inventory.count) > 0n,
  )
  return (
    <section
      aria-label={empire ? 'Empire ships' : 'Stationed ships'}
      className={styles.inventory}
    >
      <SegmentedControl
        label="Ship inventory scope"
        options={[
          { value: 'world', label: 'Planet' },
          { value: 'empire', label: 'Empire' },
        ]}
        value={scope}
        onChange={setScope}
      />
      {empty && !empire && (
        <Text>
          No ships stationed here. Build your first ships in the Shipyard or
          wait for a fleet to return.
        </Text>
      )}
      {empire && ships.length === 0 && hasCatalog && (
        <Text>No ships stationed, flying or queued in your empire.</Text>
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
                {empire && <th scope="col">Total</th>}
                <th scope="col">Stationed</th>
                <th scope="col">
                  <span className={styles.columnLabel}>
                    {empire ? 'Flying' : 'Away'}
                    <InfoTooltip
                      label={empire ? 'Flying ships' : 'Away ships'}
                      description={
                        empire
                          ? 'Your ships on outbound, holding, or returning missions across the empire.'
                          : 'Your ships launched here that are outbound, holding, or returning. Arrivals from other origins are not included.'
                      }
                    >
                      <CircleHelp size={16} aria-hidden="true" />
                    </InfoTooltip>
                  </span>
                </th>
                <th
                  scope="col"
                  title="Confirmed ships still being built; excluded from totals"
                >
                  Queued
                </th>
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
                        <th
                          scope="rowgroup"
                          role="rowheader"
                          colSpan={empire ? 5 : 4}
                        >
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
                          <img
                            src={resolveCatalogArt(entry.key).thumbnail}
                            width={32}
                            height={32}
                            alt=""
                          />
                          <span>{name}</span>
                        </Link>
                      </th>
                      {empire && (
                        <td className={styles.total}>
                          {counts.total === null ? (
                            'Unknown'
                          ) : (
                            <NumberValue value={counts.total} />
                          )}
                        </td>
                      )}
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
      {!hasCatalog && (
        <Text>
          Ship details are unavailable. Open the Shipyard to check this world's
          catalog.
        </Text>
      )}
    </section>
  )
}
