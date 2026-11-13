export type TimestampView = 'countdown' | 'local' | 'utc'
/** Numbers are Unix milliseconds; strings must include Z or an explicit offset. */
export type TimestampInput = Date | number | string

export function timestampMilliseconds(value: TimestampInput): number | null {
  if (typeof value === 'string' && !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value))
    return null
  const milliseconds =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : Date.parse(value)
  return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= 8.64e15
    ? milliseconds
    : null
}

/** One precise relative view: remaining time in the future, elapsed time in the past. */
export function formatCountdown(milliseconds: number): string {
  const seconds =
    milliseconds > 0
      ? Math.ceil(milliseconds / 1000)
      : Math.floor(Math.abs(milliseconds) / 1000)
  if (seconds === 0) return 'now'
  let remaining = seconds
  const parts: string[] = []
  for (const [size, suffix] of [
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
    [1, 's'],
  ] as const) {
    const count = Math.floor(remaining / size)
    remaining %= size
    if (count) parts.push(`${count}${suffix}`)
  }
  const duration = parts.join(' ')
  return milliseconds > 0 ? `in ${duration}` : `${duration} ago`
}

/** Absolute formats are computed once per instant/locale/zone, not on every tick. */
export function absoluteTimestamp(
  value: TimestampInput,
  locale?: string,
  timeZone?: string,
) {
  const milliseconds = timestampMilliseconds(value)
  const zone = timeZone ?? new Intl.DateTimeFormat().resolvedOptions().timeZone
  if (milliseconds === null)
    return {
      milliseconds,
      zone,
      iso: undefined,
      local: 'Time unavailable',
      utc: 'Time unavailable',
      localCopy: '',
      utcCopy: '',
    }
  const date = new Date(milliseconds)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...options,
    month: '2-digit',
    day: '2-digit',
    timeZone: zone,
    timeZoneName: 'longOffset',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00'
  // Keep milliseconds in copies so they still identify the exact supplied instant.
  const fraction = date.toISOString().slice(19, 23)
  return {
    milliseconds,
    zone,
    iso: date.toISOString(),
    local: new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: zone,
    }).format(date),
    utc: new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: 'UTC',
    }).format(date),
    localCopy: `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${fraction}${offset} [${zone}]`,
    utcCopy: date.toISOString(),
  }
}
