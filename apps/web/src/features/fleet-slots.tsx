import { NumberValue } from '../ui/number-value'
import { InfoTooltip } from '../ui/info-tooltip'

export function FleetSlotCount({
  used,
  total,
  className,
}: {
  used: number
  total: string
  className?: string
}) {
  return (
    <InfoTooltip
      label={`Fleet slots: ${used} used / ${total} total`}
      description="Used slots out of total fleet capacity. Outbound and returning fleets, including pending departures, occupy slots."
      className={className}
    >
      <span>
        <NumberValue value={used} /> / <NumberValue value={total} />
      </span>
    </InfoTooltip>
  )
}

/** Fleet slots are empire-wide, including returning and pending departures. */
export function FleetSlots({ used, total }: { used: number; total: string }) {
  return (
    <span data-touch-control="">
      Fleet slots: <NumberValue value={used} /> used /{' '}
      <NumberValue value={total} /> total
    </span>
  )
}
