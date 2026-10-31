/** Keep an observed zero distinct from intelligence that was not revealed. */
export function reportLevel(level: unknown): {
  value: string
  state: 'known' | 'zero' | 'unknown'
} {
  const value =
    typeof level === 'number' && Number.isSafeInteger(level) && level >= 0
      ? String(level)
      : typeof level === 'string' && /^\d+$/.test(level)
        ? level
        : null
  if (value === null) return { value: 'Unknown', state: 'unknown' }
  return { value, state: /^0+$/.test(value) ? 'zero' : 'known' }
}
