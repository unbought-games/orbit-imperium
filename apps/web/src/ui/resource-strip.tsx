import type { ComponentProps } from 'react'
import { NumberValue, ResourceQuantity } from './number-value'
import styles from './resource-strip.module.css'
import type { BoundView } from '../client-model/commands'
import { ResourceAmount } from './resource-amount'
import { currentResourceRates } from './resource-rates'
export function ResourceStrip({
  view,
  body,
  energyLink,
}: {
  view: BoundView
  body: BoundView['bodies'][number]
  energyLink?: ComponentProps<typeof ResourceAmount>['link']
}) {
  const rates = currentResourceRates(view, body)
  const balance = BigInt(body.energy.supply) - BigInt(body.energy.demand)
  return (
    <div className={styles.resources} aria-label="Current resources">
      {(['metal', 'crystal', 'deuterium'] as const).map((name) => {
        const value = body.amounts[name]
        const capacity = BigInt(body.capacity[name])
        const full = capacity > 0n && BigInt(value) >= capacity
        return (
          <ResourceAmount
            key={name}
            resource={name}
            amount={value}
            variant="stock"
            warning={full}
          >
            <p>
              Available{' '}
              <strong>
                <ResourceQuantity resource={name} value={value} />
              </strong>
            </p>
            <p>
              Capacity{' '}
              <strong>
                <ResourceQuantity resource={name} value={body.capacity[name]} />
              </strong>
            </p>
            <p>
              {name === 'deuterium' ? 'Net production' : 'Production'}{' '}
              <strong>
                {rates ? (
                  <>
                    {BigInt(rates[name]) > 0n ? '+' : ''}
                    <ResourceQuantity resource={name} value={rates[name]} /> /
                    hour
                  </>
                ) : (
                  'Flow unavailable'
                )}
              </strong>
            </p>
            {full && (
              <p className={styles.warning}>
                {BigInt(value) > BigInt(body.capacity[name])
                  ? 'Above capacity'
                  : 'Storage full'}{' '}
                · production suppressed
              </p>
            )}
          </ResourceAmount>
        )
      })}
      <ResourceAmount
        resource="energy"
        link={energyLink}
        amount={balance.toString()}
        variant="stock"
        warning={balance < 0n}
      >
        <p>
          Balance{' '}
          <strong>
            <ResourceQuantity resource="energy" value={balance.toString()} />
          </strong>
        </p>
        <p>
          <ResourceQuantity resource="energy" value={body.energy.supply} />{' '}
          supplied /{' '}
          <ResourceQuantity resource="energy" value={body.energy.demand} />{' '}
          demanded
        </p>
        <p>
          {balance < 0n ? 'Energy shortfall' : 'Energy balance'} ·{' '}
          <NumberValue value={body.energy.utilization} divisor={10000} />%
          utilization
        </p>
      </ResourceAmount>
    </div>
  )
}
