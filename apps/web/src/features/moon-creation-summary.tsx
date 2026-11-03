import type { components } from '../contracts'

export function MoonCreationSummary({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object' || !('chance_percent' in value))
    return null
  const outcome = value as components['schemas']['MoonCreation4']
  const created = outcome.diameter_km !== undefined
  return (
    <section aria-label="Moon creation">
      <h3>Moon creation</h3>
      <p>
        {outcome.chance_percent}% chance ·{' '}
        {created
          ? `Moon created${outcome.diameter_km === undefined ? '' : ` · ${outcome.diameter_km.toLocaleString()} km diameter`}`
          : 'No moon formed'}
        .
      </p>
      {created && <p>The debris remains available to recycle.</p>}
    </section>
  )
}
