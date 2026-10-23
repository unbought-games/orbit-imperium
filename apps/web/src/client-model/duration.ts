const units = [
  { seconds: 86400, short: 'd', word: 'day', detailBelow: 2 },
  { seconds: 3600, short: 'h', word: 'hour', detailBelow: 4 },
  { seconds: 60, short: 'm', word: null, detailBelow: 3 },
  { seconds: 1, short: 's', word: null, detailBelow: 0 },
] as const

/** Presentation only: at most two adjacent units, with less precision for long spans.
 * Examples: 1m 37s, 55m, 1h 37m, 3h 5m, 8 hours, 1 day.
 * Display rounding must never determine whether an operation has completed.
 */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds)) return 'Unknown'
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  const index = units.findIndex((unit) => seconds >= unit.seconds)
  const initial = index < 0 ? units.length - 1 : index
  const unit = units[initial]
  const next = units[initial + 1]
  const showDetail = next && seconds / unit.seconds < unit.detailBelow
  const quantum = showDetail ? next.seconds : unit.seconds
  const rounded = Math.round(seconds / quantum) * quantum
  // Rounding can carry a minute into an hour or an hour into a day.
  const promoted = units.findIndex((unit) => rounded >= unit.seconds)
  const selected = promoted < 0 ? units.length - 1 : promoted
  const primary = units[selected]
  const secondary = units[selected + 1]
  const count = Math.floor(rounded / primary.seconds)
  const remainder = secondary
    ? Math.floor((rounded % primary.seconds) / secondary.seconds)
    : 0
  if (secondary && count < primary.detailBelow && remainder > 0)
    return `${count}${primary.short} ${remainder}${secondary.short}`
  return primary.word
    ? `${count} ${primary.word}${count === 1 ? '' : 's'}`
    : `${count}${primary.short}`
}
