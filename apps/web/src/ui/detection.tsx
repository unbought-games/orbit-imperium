import { NumberValue } from './number-value'
export function DetectionPercent({ value }: { value: number }) {
  if (!Number.isInteger(value) || value < 0 || value > 1000000)
    return <>Unknown</>
  // A nonzero chance must not read as impossible after flooring.
  if (value > 0 && value < 10000)
    return (
      <>
        &lt;
        <NumberValue value={1} />%
      </>
    )
  return (
    <>
      <NumberValue value={value} divisor={10000} />%
    </>
  )
}
