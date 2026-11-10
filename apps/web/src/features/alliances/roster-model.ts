import { canDelegate, type AllianceDetail } from '../../client-model/alliances'
import type { components } from '../../contracts'
export type AllianceMember = components['schemas']['AllianceMember']

export function rosterEntries(detail: AllianceDetail) {
  return [...(detail.members ?? [])]
    .sort(
      (a, b) =>
        Number(b.player === detail.leader) -
          Number(a.player === detail.leader) ||
        a.username.localeCompare(b.username) ||
        a.player.localeCompare(b.player),
    )
    .map((member) => {
      const leader = member.player === detail.leader
      const roles =
        detail.roles?.filter(
          (role) => !role.is_default && member.roles.includes(role.id),
        ) ?? []
      return {
        member,
        leader,
        roleLabel: leader
          ? 'Leader'
          : roles.length
            ? roles.map((role) => role.name).join(' · ')
            : (detail.roles?.find((role) => role.is_default)?.name ?? 'Member'),
      }
    })
}
export function memberRoleOptions(
  detail: AllianceDetail,
  member: AllianceMember,
) {
  const roles = detail.roles ?? []
  const assignable = roles.filter(
    (role) =>
      !role.is_default &&
      canDelegate(detail, [...role.permissions, ...role.grantable_permissions]),
  )
  const locked = roles.filter(
    (role) =>
      !role.is_default &&
      member.roles.includes(role.id) &&
      !assignable.includes(role),
  )
  return { assignable, locked }
}
export const activityDescriptions: Record<string, string> = {
  Recent: 'Active in the last 15 minutes',
  Away: 'Active within the last seven days',
  Inactive: 'No activity in seven days or more',
}
