import type { AllianceDetail } from '../../client-model/alliances'
export type AuditEntry = NonNullable<AllianceDetail['audit']>[number]
const actions: Record<string, string> = {
  Create: 'Created the alliance',
  Join: 'Joined the alliance',
  Apply: 'Applied to join',
  Withdraw: 'Withdrew an application',
  Accept: 'Accepted application',
  Reject: 'Rejected application',
  Leave: 'Left the alliance',
  Kick: 'Removed member',
  Update: 'Updated alliance settings',
  SetRecruitmentProfile: 'Updated recruitment preferences',
  SetInvitation: 'Changed invitation link',
  CreateInvitation: 'Created invitation link',
  ReplaceInvitation: 'Replaced invitation link',
  DisableInvitation: 'Disabled invitation link',
  CreateRole: 'Created role',
  UpdateRole: 'Updated role',
  DeleteRole: 'Deleted role',
  AssignRoles: 'Changed roles',
  Transfer: 'Transferred leadership',
  Disband: 'Disbanded the alliance',
  CreatePost: 'Published notice',
  EditPost: 'Edited notice',
  DeletePost: 'Deleted notice',
  PinPost: 'Changed notice pin',
  PinNotice: 'Pinned notice',
  UnpinPost: 'Unpinned notice',
  EmpireRemoved: 'Empire removed',
  Succession: 'Empire removed; leadership passed to',
}
export function auditAction(entry: AuditEntry): string {
  if (entry.action === 'SaveRole')
    return entry.target ? 'Updated role' : 'Created role'
  return (
    actions[entry.action] ?? entry.action.replace(/([a-z])([A-Z])/g, '$1 $2')
  )
}

// Older servers may omit subject. Resolve only known target types, never assume
// every UUID identifies a player or expose an opaque ID as the visible label.
export function auditSubject(
  entry: AuditEntry,
  detail: Pick<
    AllianceDetail,
    'members' | 'audit' | 'roles' | 'posts' | 'applications'
  >,
): AuditEntry['subject'] {
  if (entry.subject) return entry.subject
  const id = entry.target ?? entry.id
  if (
    ['AssignRoles', 'Kick', 'Transfer'].includes(entry.action) &&
    entry.target
  ) {
    return {
      kind: 'Player',
      player: entry.target,
      label:
        detail.members?.find((m) => m.player === id)?.username ??
        'Unknown player',
    }
  }
  if (['Accept', 'Reject', 'Withdraw'].includes(entry.action)) {
    const applicant = detail.applications?.find((a) => a.id === id)
    const player =
      applicant?.player ??
      detail.audit?.find((a) => a.id === id && a.action === 'Apply')?.actor
    return {
      kind: 'Player',
      player,
      label:
        applicant?.username ??
        detail.members?.find((m) => m.player === player)?.username ??
        'Former applicant',
    }
  }
  if (
    ['SaveRole', 'CreateRole', 'UpdateRole', 'DeleteRole'].includes(
      entry.action,
    )
  ) {
    return {
      kind: 'Role',
      label:
        detail.roles?.find((r) => r.id === id)?.name ??
        (entry.action === 'DeleteRole' ? 'Deleted role' : 'Unavailable role'),
    }
  }
  if (
    [
      'CreatePost',
      'EditPost',
      'DeletePost',
      'PinPost',
      'PinNotice',
      'UnpinPost',
    ].includes(entry.action)
  ) {
    const post = detail.posts?.find((p) => p.id === id)
    return {
      kind: 'Notice',
      label: post
        ? post.title.trim() || 'Untitled notice'
        : 'Unavailable notice',
    }
  }
  return undefined
}
