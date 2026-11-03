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
