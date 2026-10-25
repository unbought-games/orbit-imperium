/** Only use the supplied observation; never look up a body's current name. */
export function bodyIdentityLabel(name: unknown, kind: unknown): string {
  const knownName = typeof name === 'string' ? name.trim() : ''
  if (kind === 'Moon') return knownName ? `${knownName} (Moon)` : 'Moon'
  return knownName || (kind === 'Planet' ? 'Planet' : '')
}
