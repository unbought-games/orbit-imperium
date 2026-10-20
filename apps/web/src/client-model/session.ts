export type Binding = { player: string; universe: string; epoch: string }
type Sample = Binding & { viewer_revision: string; as_of_ms: number }
export function acceptSnapshot(
  current: Sample | null,
  incoming: Sample,
  binding: Binding,
): boolean {
  if (
    incoming.player !== binding.player ||
    incoming.universe !== binding.universe ||
    incoming.epoch !== binding.epoch
  )
    return false
  if (!current) return true
  const prev = BigInt(current.viewer_revision),
    next = BigInt(incoming.viewer_revision)
  return next >= prev && incoming.as_of_ms >= current.as_of_ms
}

export type MembershipBinding = Pick<Binding, 'player' | 'universe'>
export function belongsToMembership(
  incoming: MembershipBinding,
  membership: MembershipBinding,
): boolean {
  return (
    incoming.player === membership.player &&
    incoming.universe === membership.universe
  )
}
export function snapshotDecision(
  current: Sample | null,
  incoming: Sample,
  membership: MembershipBinding,
): 'accepted' | 'ignored' | 'epochChanged' {
  if (!belongsToMembership(incoming, membership)) return 'ignored'
  if (current && !belongsToMembership(current, membership)) return 'ignored'
  if (current && current.epoch !== incoming.epoch) return 'epochChanged'
  return acceptSnapshot(current, incoming, {
    ...membership,
    epoch: current?.epoch ?? incoming.epoch,
  })
    ? 'accepted'
    : 'ignored'
}
