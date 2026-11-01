import type { components } from '../contracts'
type S = components['schemas']
export function attackGroupStatus(group: S['AttackGroup4'], now: number) {
  const owners = new Set(group.members.map((m) => m.owner)).size
  const open = group.joining_open && now < group.arrival_at
  return {
    owners,
    open,
    canJoin: open && group.can_join,
    label: !open
      ? 'Joining closed'
      : group.members.length >= 16
        ? 'Fleet limit reached'
        : 'Joining open',
  }
}
export function groupFlightSchedule(
  duration: number,
  now: number,
  sharedArrival: number,
) {
  const arrival = Math.max(sharedArrival, now + duration)
  return {
    arrival,
    returnAt: arrival + duration,
    total: arrival + duration - now,
  }
}
