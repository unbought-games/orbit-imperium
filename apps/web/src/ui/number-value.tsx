import { ResourceValue, type ResourceKind } from './resource-value'
import styles from './resource-value.module.css'
import { formatDuration } from '../client-model/duration'
import type { components } from '../contracts'
import { formatWholeNumber, type NumericValue } from './whole-number'

/** All potentially fractional numeric displays share this flooring policy. */
export function NumberValue({
  value,
  divisor = 1,
}: {
  value: NumericValue
  divisor?: number
}) {
  return <>{formatWholeNumber(value, divisor)}</>
}

export function ResourceNumber({ value }: { value: string | bigint }) {
  return <NumberValue value={value} divisor={1000000} />
}

/** Resource numbers shown to players always carry their identity. */
export function ResourceQuantity({
  resource,
  value,
}: {
  resource: ResourceKind
  value: string | bigint | null
}) {
  return (
    <ResourceValue resource={resource}>
      {value === null ? 'Unknown' : <ResourceNumber value={value} />}
    </ResourceValue>
  )
}

export function ResourceSummary({
  value,
}: {
  value: components['schemas']['Resources']
}) {
  return (
    <span className={styles.summary}>
      {(['metal', 'crystal', 'deuterium'] as const).map((resource) => (
        <ResourceQuantity
          key={resource}
          resource={resource}
          value={value[resource]}
        />
      ))}
    </span>
  )
}

/** Whole units still needed: round up to agree with floored available balances. */
export function ResourceShortfall({ value }: { value: string }) {
  return <NumberValue value={(BigInt(value) + 999999n) / 1000000n} />
}

export function DurationValue({ milliseconds }: { milliseconds: number }) {
  return <>{formatDuration(milliseconds)}</>
}
