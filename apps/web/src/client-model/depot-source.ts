import type { components } from '../contracts'
type Body = components['schemas']['BodyV3']

/** Derive the paying planet from the moon's authoritative parent binding. */
export function depotSourceBody(bodies: readonly Body[], id: string) {
  const body = bodies.find((candidate) => candidate.id === id)
  if (!body || body.kind === 'Planet') return body
  return bodies.find(
    (parent) =>
      parent.id === body.moon?.parent &&
      parent.kind === 'Planet' &&
      parent.coordinates.galaxy === body.coordinates.galaxy &&
      parent.coordinates.system === body.coordinates.system &&
      parent.coordinates.position === body.coordinates.position,
  )
}
