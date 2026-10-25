import type { Page } from './test'
/** Edit the single coordinate field while preserving its other segments. */
export async function setDestination(
  page: Page,
  parts: Partial<Record<'galaxy' | 'system' | 'position', string>>,
) {
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const current = (await input.inputValue()).split(':')
  await input.fill(
    (['galaxy', 'system', 'position'] as const)
      .map((key, index) => parts[key] ?? current[index] ?? '')
      .join(':'),
  )
}
export function coordinatePattern(
  part: 'galaxy' | 'system' | 'position',
  value: string,
) {
  return new RegExp(
    '^' +
      ['galaxy', 'system', 'position']
        .map((key) =>
          key === part ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '[^:]*',
        )
        .join(':') +
      '$',
  )
}
