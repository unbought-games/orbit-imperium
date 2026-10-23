import type { BoundView } from './commands'

export function positionAstrophysics(position: number): number | null {
  if (!Number.isInteger(position) || position < 1 || position > 15) return null
  if (position >= 4 && position <= 12) return 1
  if (position === 3 || position === 13) return 4
  if (position === 2 || position === 14) return 6
  return 8
}

/** Presentation only. Quotes and ordered arrival recheck authoritative facts. */
export function colonizationStatus(
  view:
    | (Pick<BoundView, 'capabilities' | 'research'> & {
        bodies: readonly { kind: 'Planet' | 'Moon' }[]
      })
    | null,
  position: number,
) {
  const enabled =
    view?.capabilities.some((c) => c.capability === 'Colonize' && c.enabled) ??
    false
  const level =
    view?.research.find((r) => r.research === 'Astrophysics')?.level ?? 0
  const required = positionAstrophysics(position)
  const count = view?.bodies.filter((b) => b.kind === 'Planet').length ?? 0
  const capacity = 1 + Math.ceil(level / 2)
  return {
    enabled,
    level,
    required,
    count,
    capacity,
    reason: !enabled
      ? 'Colonization is unavailable in this universe.'
      : required === null
        ? 'Choose a planet position from 1 to 15.'
        : level < required
          ? `Astrophysics level ${required} is required for this position.`
          : null,
    warning:
      count >= capacity
        ? 'Your planet limit is full. Launch is allowed; the entire fleet and cargo return unless capacity becomes available before arrival.'
        : 'Arrival is not reserved. Success consumes one Colony Ship and deposits all cargo plus 500 metal and 500 crystal; escorts and extra Colony Ships return.',
  }
}
