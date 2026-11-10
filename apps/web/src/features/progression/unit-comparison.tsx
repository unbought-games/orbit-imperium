import { useState } from 'react'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { ResourceValue } from '../../ui/resource-value'
import { formatCombatStat } from './ship-statistics-format'
import {
  comparisonStats,
  comparisonFacts,
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

export function UnitComparison({
  catalog,
  research,
  initialId,
  kind,
}: {
  catalog: ShipEntry[]
  research: Research
  initialId?: string
  kind: 'Ship' | 'Defense'
}) {
  const defense = kind === 'Defense'
  const noun = defense ? 'defenses' : 'ships'
  const singular = defense ? 'defense' : 'ship'
  const title = defense ? 'Defense' : 'Ship'
  const defaults = defense
    ? ['RocketLauncher', 'LightLaser']
    : ['LightFighter', 'HeavyFighter']
  const [ids, setIds] = useState<string[]>(() => [
    ...new Set([
      initialId ?? defaults[0],
      initialId === defaults[1] ? defaults[0] : defaults[1],
    ]),
  ])
  const [mode, setMode] = useState<StatMode>('current')
  const units = catalog.filter((e) => e.enabled && e.key.kind === kind)
  const selected = units.filter((e) => ids.includes(e.key.id))
  const columns = selected.map((e) => comparisonStats(e, research, mode))
  const rows = [
    ...(['metal', 'crystal', 'deuterium'] as const).map((resource, i) => ({
      title: `${resource[0].toUpperCase() + resource.slice(1)} cost`,
      values: columns.map((c) => (
        <ResourceValue resource={resource}>{number(c.cost?.[i])}</ResourceValue>
      )),
    })),
    ...(!defense
      ? [
          {
            title: 'Cargo capacity',
            values: columns.map((c) =>
              c.stationary ? 'None' : number(c.cargo),
            ),
          },
          {
            title: mode === 'base' ? 'Base speed' : 'Effective speed',
            values: columns.map((c) =>
              c.stationary ? 'Stationary' : number(c.speed),
            ),
          },
          {
            title: 'Drive',
            values: columns.map((c) =>
              c.stationary ? 'None' : c.drive ? label(c.drive) : 'Unavailable',
            ),
          },
          {
            title: 'Fuel consumption per ship',
            values: columns.map((c) => (
              <ResourceValue resource="deuterium">
                {c.stationary ? 'None' : number(c.fuel)}
              </ResourceValue>
            )),
          },
        ]
      : []),
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
      <summary>Compare {noun}</summary>
      <fieldset className={styles.choices}>
        <legend>{title}s to compare</legend>
        {units.map((e) => (
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
            name={`${singular}-stat-mode`}
            checked={mode === 'base'}
            onChange={() => setMode('base')}
          />
          Base stats
        </label>
        <label>
          <input
            type="radio"
            name={`${singular}-stat-mode`}
            checked={mode === 'current'}
            onChange={() => setMode('current')}
          />
          My current stats
        </label>
      </fieldset>
      <p>
        {mode === 'current'
          ? defense
            ? 'Attack, shield and hull use your completed Weapons, Shielding and Armour Technology respectively. Queued research does not apply.'
            : 'Effective values use your completed research and active drive replacements. Queued research does not apply.'
          : defense
            ? 'Base values before research bonuses.'
            : 'Base values before research bonuses and drive replacements.'}{' '}
        All values use this universe’s active rules. Missing data is shown as
        unavailable.
      </p>
      {selected.length > 2 && (
        <p>Scroll across the table to compare all selected {noun}.</p>
      )}
      {selected.length ? (
        <div
          className={styles.scroll}
          role="region"
          aria-label={`${title} comparison table`}
          tabIndex={0}
        >
          <table>
            <caption>
              {mode === 'base'
                ? `Base ${singular} statistics`
                : `Current player ${singular} statistics`}{' '}
              · per {singular}
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
        <p>Select {noun} to compare.</p>
      )}
      {defense && selected.length > 0 && (
        <dl className={styles.facts}>
          {comparisonFacts(selected).map((fact) => (
            <div key={JSON.stringify([fact.label, fact.value])}>
              <dt>
                {fact.label}
                {fact.ids.length < selected.length &&
                  ` · ${fact.ids.map(label).join(', ')}`}
              </dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {defense ? (
        <p>
          Defenses remain on their planet or moon. Missiles use separate missile
          warfare rules and are not included.
        </p>
      ) : (
        <p>
          Speed is not flight time. Mission duration and fuel depend on the
          slowest ship, route, universe speed and speed setting. Cargo space is
          shared by resources and mission fuel.
        </p>
      )}
    </details>
  )
}
