import { useState } from 'react'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { ResourceValue } from '../../ui/resource-value'
import { formatCombatStat } from './ship-statistics-format'
import {
  comparisonStats,
  type ShipEntry,
  type Research,
  type StatMode,
} from './ship-comparison-model'
import styles from './ship-comparison.module.css'

const number = (value?: string) =>
  value === undefined ? 'Unavailable' : <NumberValue value={value} />
const combat = (value?: string) =>
  value === undefined ? 'Unavailable' : formatCombatStat(value)
const rapidFire = (values: ReturnType<typeof comparisonStats>['against']) =>
  values === undefined
    ? 'Unavailable'
    : values.length
      ? values.map((v) => `${label(v.unit.id)} × ${v.factor}`).join('; ')
      : 'None'

export function ShipComparison({
  catalog,
  research,
  initialShipId,
}: {
  catalog: ShipEntry[]
  research: Research
  initialShipId?: string
}) {
  const [ids, setIds] = useState<string[]>(() => [
    ...new Set([initialShipId ?? 'LightFighter', 'HeavyFighter']),
  ])
  const [mode, setMode] = useState<StatMode>('current')
  const ships = catalog.filter((e) => e.enabled && e.key.kind === 'Ship')
  const selected = ships.filter((e) => ids.includes(e.key.id))
  const columns = selected.map((e) => comparisonStats(e, research, mode))
  const rows = [
    ...(['metal', 'crystal', 'deuterium'] as const).map((resource, i) => ({
      title: `${resource[0].toUpperCase() + resource.slice(1)} cost`,
      values: columns.map((c) => (
        <ResourceValue resource={resource}>{number(c.cost?.[i])}</ResourceValue>
      )),
    })),
    { title: 'Cargo capacity', values: columns.map((c) => number(c.cargo)) },
    {
      title: mode === 'base' ? 'Base speed' : 'Effective speed',
      values: columns.map((c) => number(c.speed)),
    },
    {
      title: 'Drive',
      values: columns.map((c) => (c.drive ? label(c.drive) : 'Unavailable')),
    },
    {
      title: 'Fuel consumption per ship',
      values: columns.map((c) => (
        <ResourceValue resource="deuterium">{number(c.fuel)}</ResourceValue>
      )),
    },
    { title: 'Attack strength', values: columns.map((c) => combat(c.attack)) },
    { title: 'Shield strength', values: columns.map((c) => combat(c.shield)) },
    { title: 'Hull strength', values: columns.map((c) => combat(c.hull)) },
    {
      title: 'Rapid fire against',
      values: columns.map((c) => rapidFire(c.against)),
    },
    { title: 'Rapid fire from', values: columns.map((c) => rapidFire(c.from)) },
  ]
  return (
    <details className={styles.panel}>
      <summary>Compare ships</summary>
      <fieldset className={styles.choices}>
        <legend>Ships to compare</legend>
        {ships.map((e) => (
          <label key={e.key.id}>
            <input
              type="checkbox"
              checked={ids.includes(e.key.id)}
              onChange={(event) =>
                setIds((current) =>
                  event.target.checked
                    ? [...current, e.key.id]
                    : current.filter((id) => id !== e.key.id),
                )
              }
            />
            {label(e.key.id)}
          </label>
        ))}
      </fieldset>
      <fieldset className={styles.choices}>
        <legend>Statistics</legend>
        <label>
          <input
            type="radio"
            name="ship-stat-mode"
            checked={mode === 'base'}
            onChange={() => setMode('base')}
          />
          Base stats
        </label>
        <label>
          <input
            type="radio"
            name="ship-stat-mode"
            checked={mode === 'current'}
            onChange={() => setMode('current')}
          />
          My current stats
        </label>
      </fieldset>
      <p>
        {mode === 'current'
          ? 'Effective values use your completed research and active drive replacements. Queued research does not apply.'
          : 'Base values before research bonuses and drive replacements.'}{' '}
        All values use this universe’s active rules. Missing data is shown as
        unavailable.
      </p>
      {selected.length > 2 && (
        <p>Scroll across the table to compare all selected ships.</p>
      )}
      {selected.length ? (
        <div
          className={styles.scroll}
          role="region"
          aria-label="Ship comparison table"
          tabIndex={0}
        >
          <table>
            <caption>
              {mode === 'base'
                ? 'Base ship statistics'
                : 'Current player ship statistics'}{' '}
              · per ship
            </caption>
            <thead>
              <tr>
                <th scope="col">Statistic</th>
                {selected.map((e) => (
                  <th scope="col" key={e.key.id}>
                    {label(e.key.id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.title}>
                  <th scope="row">{row.title}</th>
                  {row.values.map((value, i) => (
                    <td key={selected[i].key.id}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>Select ships to compare.</p>
      )}
      <p>
        Speed is not flight time. Mission duration and fuel depend on the
        slowest ship, route, universe speed and speed setting. Cargo space is
        shared by resources and mission fuel.
      </p>
    </details>
  )
}
