import { NumberValue } from '../ui/number-value'

/** Fleet slots are empire-wide, including returning and pending departures. */
export function FleetSlots({ used, total }: { used: number; total: string }) {
  return (
    <span>
      Fleet slots: <NumberValue value={used} /> used /{' '}
      <NumberValue value={total} /> total
    </span>
  )
}
