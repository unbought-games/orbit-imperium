import type { dispatchCargoCapacity } from '../client-model/dispatch-cargo'
import { NumberValue } from '../ui/number-value'
import styles from './missions.module.css'

export function DispatchCargoCapacity({
  space,
  message,
}: {
  space: ReturnType<typeof dispatchCargoCapacity>
  message: string
}) {
  return (
    <span
      className={styles.cargoCapacity}
      role="group"
      aria-label="Cargo capacity"
    >
      {space ? (
        <>
          <span>
            <NumberValue value={space.capacity} /> total capacity
          </span>
          {space.payload !== space.capacity && (
            <span>
              <NumberValue value={space.payload} /> after fuel
            </span>
          )}
          {space.remaining === null ? (
            <span>Enter whole nonnegative cargo amounts.</span>
          ) : space.remaining < 0n ? (
            <span className={styles.cargoOverCapacity}>
              <NumberValue value={-space.remaining} /> over capacity
            </span>
          ) : space.loaded !== 0n ? (
            <span>
              <NumberValue value={space.remaining} /> remaining
            </span>
          ) : null}
        </>
      ) : (
        message
      )}
    </span>
  )
}
