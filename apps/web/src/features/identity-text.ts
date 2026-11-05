const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Keep decorations with a complete edge character, without making the whole
 * name atomic. Graphemes preserve combining marks and joined emoji. */
export function identityTextParts(name: string) {
  const characters = Array.from(graphemes.segment(name), (part) => part.segment)
  const first = characters.length > 1 ? characters.shift()! : ''
  const last = characters.pop() ?? ''
  return { first, middle: characters.join(''), last }
}
