import { NumberValue, ResourceQuantity } from '../../ui/number-value'
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
}: Pick<ProgressionProps, 'coordinator' | 'view' | 'body'>) {
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
              <ResourceQuantity
                resource={name}
                value={production.gross_per_hour[name]}
              />
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
            <ResourceQuantity
              resource="energy"
              value={(
                BigInt(production.energy_supply) -
                BigInt(production.energy_demand)
              ).toString()}
            />
          </strong>
          <small>
            <ResourceQuantity
              resource="energy"
              value={production.energy_supply}
            />{' '}
            supplied /{' '}
            <ResourceQuantity
              resource="energy"
              value={production.energy_demand}
            />{' '}
            demanded
          </small>
        </div>
      </div>
      <div>
        <table className={styles.table} aria-label="Production settings">
          <thead>
            <tr>
              <th scope="col">Producer</th>
              <th scope="col">Level / quantity</th>
              <th scope="col">Output</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(([key]) => production.editable.includes(key))
              .map(([key, building]) => (
                <tr key={key}>
                  <th scope="row">{label(building)}</th>
                  <td>
                    {building === 'SolarSatellite' ? (
                      <NumberValue
                        value={
                          body.inventories.find(
                            (x) =>
                              x.item.kind === 'Ship' &&
                              x.item.id === 'SolarSatellite',
                          )?.count ?? '0'
                        }
                      />
                    ) : (
                      (body.levels[building as keyof typeof body.levels] ?? '—')
                    )}
                  </td>
                  <td>
                    <Select
                      data-analytics="set_production"
                      aria-label={`${label(key)} production`}
                      value={
                        autosave.settings?.[key] ?? production.settings[key]
                      }
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
                    {key === 'solar_satellite' &&
                      production.solar_satellite && (
                        <span>
                          {' '}
                          ·{' '}
                          <ResourceQuantity
                            resource="energy"
                            value={production.solar_satellite.energy_supply}
                          />{' '}
                          supplied
                          {' · '}
                          <ResourceQuantity
                            resource="energy"
                            value={production.solar_satellite.unit_energy}
                          />{' '}
                          per satellite at 100%
                        </span>
                      )}
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
      <details className={styles.notes}>
        <summary>Production rules and unavailable sources</summary>
        {rows.some(([key]) => !production.editable.includes(key)) && (
          <p>
            Unavailable:{' '}
            {rows
              .filter(([key]) => !production.editable.includes(key))
              .map(([, building]) => label(building))
              .join(', ')}
            .
          </p>
        )}
        <p>
          Deuterium fuel:{' '}
          <ResourceQuantity
            resource="deuterium"
            value={production.fuel_deuterium_per_hour}
          />{' '}
          / hour · Net deuterium:{' '}
          <ResourceQuantity
            resource="deuterium"
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
      </details>
    </Section>
  )
}
