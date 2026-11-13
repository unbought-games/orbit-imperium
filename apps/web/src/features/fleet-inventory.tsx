import { Fragment, useState } from 'react'
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
  const empty = !ships.some(({ counts }) => BigInt(counts.stationed) > 0n)
  return (
    <section
      aria-label={empire ? 'Empire ships' : 'Stationed ships'}
      className={styles.inventory}
    >
      <div className={styles.header}>
        <div>
          <Heading level={2}>
            {empire ? 'Empire ships' : 'Stationed ships'}
          </Heading>
          <Text>
            {empire ? (
              'All planets and moons'
            ) : (
              <>
                {bodyName(body)}{' '}
                <CoordinateLink
                  at={body.coordinates}
                  target={body.kind === 'Moon' ? 'moon' : 'planet'}
                />
              </>
            )}
          </Text>
        </div>
        <ButtonLink
          variant="secondary"
          {...routeTarget(universe, 'shipyard', body.id)}
        >
          Open Shipyard
        </ButtonLink>
      </div>
      <SegmentedControl
        label="Ship inventory scope"
        options={[
          { value: 'world', label: 'This world' },
          { value: 'empire', label: 'Entire empire' },
        ]}
        value={scope}
        onChange={setScope}
      />
      <Text>
        Confirmed counts. Flying{empire ? '' : ' from this world'} includes
        returning and holding fleets.
      </Text>
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
                          {name}
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
      {hasCatalog && (
        <Text>
          Queued ships are not built yet
          {empire ? ' and are excluded from totals' : ''}. Pending orders appear
          after confirmation. Select a ship to build more on {bodyName(body)}.
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
