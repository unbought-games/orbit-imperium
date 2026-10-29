import type { components } from '../contracts'
import { Button } from '../ui/button'
import { NumberInput } from '../ui/form'
import { NumberValue } from '../ui/number-value'
import { label } from '../ui/format'
import { compareShips, shipGroup } from './ship-order'
import styles from './fleet-inventory.module.css'
type S = components['schemas']

export function DispatchShips({
  view,
  body,
  types,
  ships,
  onChange,
  onNormalize,
}: {
  view: S['BoundView4']
  body: S['BodyV3']
  types: string[]
  ships: Record<string, string>
  onChange: (id: string, value: string) => void
  onNormalize: (id: string) => void
}) {
  const entries = view.catalog
    .filter(
      (entry) => entry.key.kind === 'Ship' && types.includes(entry.key.id),
    )
    .sort(compareShips)
  return (
    <fieldset className={styles.selection}>
      <legend>Ships</legend>
      <table className={styles.ships} aria-label="Ships to dispatch">
        <thead>
          <tr>
            <th scope="col">Ship</th>
            <th scope="col">Available</th>
            <th scope="col">Send</th>
          </tr>
        </thead>
        {['Warships', 'Transports', 'Utility'].map((group) => {
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
                  const available =
                    body.inventories.find(
                      (stack) =>
                        stack.item.kind === 'Ship' && stack.item.id === id,
                    )?.count ?? '0'
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
                        <NumberInput
                          aria-label={`${label(id)} · ${available} available`}
                          value={ships[id] ?? '0'}
                          placeholder="0"
                          onChange={(event) => onChange(id, event.target.value)}
                          onBlur={(event) => {
                            if (!event.target.value.trim()) onNormalize(id)
                          }}
                        />
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
