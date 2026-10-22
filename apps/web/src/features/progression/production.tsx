import { NumberValue, ResourceNumber } from '../../ui/number-value'
import { Button } from '../../ui/button'
import { Select } from '../../ui/form'
import { Section } from '../../ui/section'
import { useProductionAutosave } from './use-production-autosave'
import { label } from '../../ui/format'
import { type ProgressionProps } from './shared'
import styles from './production.module.css'
export function Production({
  coordinator: model,
  view,
  body,
}: ProgressionProps) {
  const production = view.progression.production.find(
    (x) => x.body === body.id,
  )!
  const autosave = useProductionAutosave(model, body.id)
  const rows = [
    ['metal_mine', 'MetalMine'],
    ['crystal_mine', 'CrystalMine'],
    ['deuterium_synthesizer', 'DeuteriumSynthesizer'],
    ['solar_plant', 'SolarPlant'],
    ['fusion_reactor', 'FusionReactor'],
    ['solar_satellite', 'SolarSatellite'],
  ] as const
  return (
    <Section aria-label="Production controls" className={styles.production}>
      <div className={styles.factor}>
        <strong>
          Production factor:{' '}
          <NumberValue value={production.utilization} divisor={10000} />%
        </strong>
      </div>
      <div className={styles.totals}>
        {(['metal', 'crystal', 'deuterium'] as const).map((name) => (
          <div key={name}>
            <span>{name}</span>
            <strong>
              <ResourceNumber value={production.gross_per_hour[name]} />
            </strong>
            <small>/ hour</small>
          </div>
        ))}
        <div>
          <span>Energy balance</span>
          <strong
            className={
              BigInt(production.energy_supply) <
              BigInt(production.energy_demand)
                ? styles.negative
                : undefined
            }
          >
            <ResourceNumber
              value={(
                BigInt(production.energy_supply) -
                BigInt(production.energy_demand)
              ).toString()}
            />
          </strong>
          <small>
            <ResourceNumber value={production.energy_supply} /> supplied /{' '}
            <ResourceNumber value={production.energy_demand} /> demanded
          </small>
        </div>
      </div>
      <div>
        <table className={styles.table} aria-label="Production settings">
          <thead>
            <tr>
              <th scope="col">Building</th>
              <th scope="col">Level</th>
              <th scope="col">Notes</th>
              <th scope="col">Output</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, building]) => (
              <tr key={key}>
                <th scope="row">{label(building)}</th>
                <td>
                  {body.levels[building as keyof typeof body.levels] ?? '—'}
                </td>
                <td className={styles.effect}>
                  {!production.editable.includes(key) && (
                    <small>Unavailable</small>
                  )}
                </td>
                <td>
                  <Select
                    aria-label={`${label(key)} production`}
                    value={autosave.settings?.[key] ?? production.settings[key]}
                    disabled={!production.editable.includes(key)}
                    onChange={(event) =>
                      autosave.change(
                        key,
                        Number(
                          event.target.value,
                        ) as (typeof production.settings)[typeof key],
                      )
                    }
                  >
                    {Array.from({ length: 11 }, (_, i) => i * 10).map((n) => (
                      <option key={n} value={n}>
                        {n}%
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={styles.save}>
          {autosave.error ? (
            <>
              <span role="alert">{autosave.error}</span>
              <Button type="button" onClick={() => void autosave.retry()}>
                Retry production changes
              </Button>
            </>
          ) : (
            <span role="status">{autosave.status}</span>
          )}
        </div>
      </div>
      <div className={styles.notes}>
        <p>
          Deuterium fuel:{' '}
          <ResourceNumber value={production.fuel_deuterium_per_hour} /> / hour ·
          Net deuterium:{' '}
          <ResourceNumber
            value={
              BigInt(production.net_deuterium_per_hour.magnitude) *
              (production.net_deuterium_per_hour.sign === 'Negative' ? -1n : 1n)
            }
          />{' '}
          / hour · Fuel utilization:{' '}
          <NumberValue value={production.fuel_utilization} divisor={10000} />
          %.
        </p>
        <p>
          Rates use saved settings, before storage limits. Full storage stops
          production; excess resources remain usable. Energy shortages reduce
          output without changing your settings.
        </p>
      </div>
    </Section>
  )
}
