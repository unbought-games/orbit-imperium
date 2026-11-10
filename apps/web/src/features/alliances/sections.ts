import { can, type AllianceDetail } from '../../client-model/alliances'

/** Derive navigation from the latest authoritative alliance permissions. */
export function allianceSections(detail: AllianceDetail | null) {
  if (!detail) return []
  return [
    'Board',
    ...(can(detail, 'ViewMembers') ? ['Members'] : []),
    ...(can(detail, 'ViewApplications') ? ['Applications'] : []),
    ...(detail.roles &&
    (can(detail, 'ManageRoles') || can(detail, 'AssignRoles'))
      ? ['Roles']
      : []),
    'Settings',
    ...(can(detail, 'ViewAudit') ? ['Audit'] : []),
  ]
}
