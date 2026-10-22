import { NumberValue, ResourceNumber } from './number-value'
import styles from './resource-strip.module.css'
import type { BoundView } from '../client-model/commands'
import { ResourceAmount } from './resource-amount'
import { currentResourceRates } from './resource-rates'
export function ResourceStrip({
  view,
  body,
}: {
  view: BoundView
  body: BoundView['bodies'][number]
}) {
  const rates = currentResourceRates(view, body)
  const balance = BigInt(body.energy.supply) - BigInt(body.energy.demand)
  return (
    <div className={styles.resources} aria-label="Current resources">
      {(['metal', 'crystal', 'deuterium'] as const).map((name) => {
        const value = body.amounts[name]
        const full = BigInt(value) >= BigInt(body.capacity[name])
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
                <ResourceNumber value={value} />
              </strong>
            </p>
            <p>
              Capacity{' '}
              <strong>
                <ResourceNumber value={body.capacity[name]} />
              </strong>
            </p>
            <p>
              {name === 'deuterium' ? 'Net production' : 'Production'}{' '}
              <strong>
                {rates ? (
                  <>
                    {BigInt(rates[name]) > 0n ? '+' : ''}
                    <ResourceNumber value={rates[name]} /> / hour
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
        amount={balance.toString()}
        variant="stock"
        warning={balance < 0n}
      >
        <p>
          Balance{' '}
          <strong>
            <ResourceNumber value={balance.toString()} />
          </strong>
        </p>
        <p>
          <ResourceNumber value={body.energy.supply} /> supplied /{' '}
          <ResourceNumber value={body.energy.demand} /> demanded
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
