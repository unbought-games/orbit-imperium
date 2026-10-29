import type { components } from '../contracts'
import { Button } from '../ui/button'
import { InputWithAction, FillButton } from '../ui/input-with-action'
import { availableDispatchShips } from '../client-model/ship-selection'
import { NumberInput } from '../ui/form'
import { NumberValue } from '../ui/number-value'
import { label } from '../ui/format'
import { compareShips, shipGroup, shipGroups } from './ship-order'
import styles from './fleet-inventory.module.css'
type S = components['schemas']

export function DispatchShips({
  view,
  body,
  types,
  ships,
  onChange,
  onNormalize,
  onAddAll,
}: {
  view: S['BoundView4']
  body: S['BodyV3']
  types: string[]
  ships: Record<string, string>
  onChange: (id: string, value: string) => void
  onNormalize: (id: string) => void
  onAddAll: (ships: Record<string, string>) => void
}) {
  const availableShips = availableDispatchShips(types, body.inventories)
  const empty = Object.values(availableShips).every(
    (count) => BigInt(count) === 0n,
  )
  const entries = view.catalog
    .filter(
      (entry) => entry.key.kind === 'Ship' && types.includes(entry.key.id),
    )
    .sort(compareShips)
  return (
    <fieldset className={styles.selection}>
      <legend className={styles.srOnly}>Ships</legend>
      <div className={styles.selectionHeader}>
        <span className={styles.selectionTitle} aria-hidden="true">
          Ships
        </span>
        <Button
          type="button"
          variant="ghost"
          size="small"
          aria-label="Add all ships"
          title="Add every available ship to this fleet"
          disabled={empty}
          onClick={() => onAddAll(availableShips)}
        >
          Add All
        </Button>
      </div>
      <table className={styles.ships} aria-label="Ships to dispatch">
        <thead>
          <tr>
            <th scope="col">Ship</th>
            <th scope="col">Available</th>
            <th scope="col">Send</th>
          </tr>
        </thead>
        {shipGroups.map((group) => {
          const rows = entries.filter((entry) => shipGroup(entry) === group)
          return (
            rows.length > 0 && (
              <tbody key={group}>
                <tr className={styles.group}>
                  <th colSpan={3} scope="rowgroup" role="rowheader">
                    {group}
                  </th>
                </tr>
                {rows.map((entry) => {
                  const id = entry.key.id
                  const available = availableShips[id]
                  return (
                    <tr key={id}>
                      <th scope="row">{label(id)}</th>
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          size="small"
                          aria-label={`All ${label(id)}`}
                          title={`Send all ${available} available ${label(id)}`}
                          onClick={() => onChange(id, available)}
                        >
                          <NumberValue value={available} />
                        </Button>
                      </td>
                      <td>
                        <InputWithAction className={styles.shipAmount}>
                          <NumberInput
                            aria-label={`${label(id)} · ${available} available`}
                            value={ships[id] ?? '0'}
                            placeholder="0"
                            onChange={(event) =>
                              onChange(id, event.target.value)
                            }
                            onBlur={(event) => {
                              if (!event.target.value.trim()) onNormalize(id)
                            }}
                          />
                          <FillButton
                            aria-label={`Max ${label(id)}`}
                            title={`Add all ${available} available ${label(id)}`}
                            disabled={BigInt(available) === 0n}
                            onClick={() => onChange(id, available)}
                          />
                        </InputWithAction>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            )
          )
        })}
      </table>
    </fieldset>
  )
}
