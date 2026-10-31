export const resourceKinds = ['metal', 'crystal', 'deuterium'] as const

/** Hide empty debris deuterium, but preserve nonzero and unknown observations. */
export function debrisResourceKinds(deuterium: unknown) {
  return deuterium === undefined || deuterium === '0' || deuterium === 0n
    ? (['metal', 'crystal'] as const)
    : resourceKinds
}
