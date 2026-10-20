import type { components } from '../contracts'
export const label = (s: string) =>
  s.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
export function formatResource(value: string): string {
  // Display whole units only; affordability and simulation retain micro-units.
  return (BigInt(value) / 1000000n).toLocaleString('en-US')
}
export const costs = (r: components['schemas']['Resources']) =>
  `${formatResource(r.metal)} metal · ${formatResource(r.crystal)} crystal · ${formatResource(r.deuterium)} deuterium`
export const coordinates = (b: {
  coordinates: components['schemas']['Coordinates']
}) =>
  `[${b.coordinates.galaxy}:${b.coordinates.system}:${b.coordinates.position}]`

export function formatCombatTicks(value: string): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return 'Unknown'
  const n = BigInt(value),
    fraction = (n % 100000n).toString().padStart(5, '0').replace(/0+$/, '')
  return `${(n / 100000n).toLocaleString('en-US')}${fraction ? '.' + fraction : ''}`
}

/** Exact decimal representation of micro-units; no floating-point conversion. */
export function formatExactResource(value: string): string {
  const signed = BigInt(value)
  const magnitude = signed < 0n ? -signed : signed
  const fraction = (magnitude % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return `${signed < 0n ? '-' : ''}${(magnitude / 1000000n).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`
}
