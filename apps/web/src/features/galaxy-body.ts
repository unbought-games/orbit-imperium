import type { components } from '../contracts'
type S = components['schemas']

/** Owner policy is shared; body identity and activity are local to the moon. */
export function publicMoonBody(
  position: S['GalaxyPosition4'],
): S['PublicBody4'] | undefined {
  const { body, moon } = position
  if (!body || !moon) return undefined
  return {
    ...body,
    id: moon.id,
    name: moon.name,
    kind: 'Moon',
    activity: moon.activity ?? { type: 'None' },
  }
}

/** Find exactly the observed body; a moon's owner policy comes from its parent. */
export function observedBody(
  observation: S['GalaxySystem4'] | undefined,
  id: string | undefined,
): S['PublicBody4'] | undefined {
  if (!id) return undefined
  for (const position of observation?.positions ?? []) {
    if (position.body?.id === id) return position.body
    if (position.moon?.id === id) return publicMoonBody(position)
  }
  return undefined
}
