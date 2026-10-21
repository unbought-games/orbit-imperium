// Must match PostgreSQL universe_name_key. Escaping keeps arbitrary names in one
// path segment, including slashes, punctuation, emoji, and dot-only names.
export function universeSlug(name: string): string {
  return Array.from(name, (character) => {
    if (character === ' ') return '-'
    if (/^[A-Za-z0-9-]$/.test(character)) return character.toLowerCase()
    return `~${character.codePointAt(0)!.toString(16)}~`
  }).join('')
}
