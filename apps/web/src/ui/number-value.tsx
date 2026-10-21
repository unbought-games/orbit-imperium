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

export function ResourceSummary({
  value,
}: {
  value: components['schemas']['Resources']
}) {
  return (
    <>
      <ResourceNumber value={value.metal} /> metal ·{' '}
      <ResourceNumber value={value.crystal} /> crystal ·{' '}
      <ResourceNumber value={value.deuterium} /> deuterium
    </>
  )
}

/** A positive deficit must never read as no resources needed. */
export function ResourceShortfall({ value }: { value: string }) {
  return BigInt(value) > 0n && BigInt(value) < 1000000n ? (
    <>
      &lt;
      <ResourceNumber value="1000000" />
    </>
  ) : (
    <ResourceNumber value={value} />
  )
}

export function DurationValue({ milliseconds }: { milliseconds: number }) {
  const seconds = Math.floor(milliseconds / 1000)
  return (
    <>
      {seconds >= 3600 && (
        <>
          <NumberValue value={seconds / 3600} />h{' '}
        </>
      )}
      {seconds >= 60 && (
        <>
          <NumberValue value={(seconds / 60) % 60} />m{' '}
        </>
      )}
      <NumberValue value={seconds % 60} />s
    </>
  )
}
