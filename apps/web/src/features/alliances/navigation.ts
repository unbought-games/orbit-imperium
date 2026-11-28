import type {
  AllianceAction,
  AllianceDetail,
} from '../../client-model/alliances'
import { allianceSections } from './sections'

export const allianceDestinations = {
  Hall: 'hall',
  Members: 'members',
  Applications: 'applications',
  Roles: 'roles',
  Settings: 'settings',
  Audit: 'audit',
} as const
export const allianceSettingsDestinations = {
  Profile: 'identity',
  Hall: 'hall',
  'Public page': 'public-page',
  Media: 'media',
  Recruitment: 'recruitment',
  Invitations: 'invitations',
  Leadership: 'leadership',
  Membership: 'membership',
} as const
export type SettingsDestination = keyof typeof allianceSettingsDestinations

export function isAllianceDestination(item: string) {
  const [section, settings, extra] = item.split('/')
  return (
    extra === undefined &&
    Object.values(allianceDestinations).some((value) => value === section) &&
    (settings === undefined ||
      (section === 'applications' &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(settings)) ||
      (section === 'settings' &&
        Object.values(allianceSettingsDestinations).some(
          (value) => value === settings,
        )))
  )
}

export function allianceDestination(
  item: string | null,
  detail: AllianceDetail | null,
) {
  const [section = 'hall', settings] = (item ?? 'hall').split('/')
  const tab =
    Object.entries(allianceDestinations).find(
      ([, value]) => value === section,
    )?.[0] ?? 'Hall'
  const settingsSection = (Object.entries(allianceSettingsDestinations).find(
    ([, value]) => value === settings,
  )?.[0] ?? 'Profile') as SettingsDestination
  return {
    active: allianceSections(detail).includes(tab) ? tab : 'Hall',
    settingsSection,
  }
}

/** Section links keep the same mounted workspace and its authored drafts. */
export function sameAllianceWorkspace(current: string, next: string) {
  const root = (pathname: string) => {
    const match = /^(\/u\/[^/]+(?:\/b\/[^/]+)?\/alliance)(?:\/(.*))?$/.exec(
      pathname,
    )
    return match && (!match[2] || isAllianceDestination(match[2]))
      ? match[1]
      : null
  }
  const currentRoot = root(current)
  return currentRoot !== null && currentRoot === root(next)
}

/** Recovery belongs to the command whose receipt is outstanding. */
export function previousAllianceAction(
  action: AllianceAction | undefined,
  application: string,
) {
  if (!action) return null
  if (action.type === 'Accept' || action.type === 'Reject') {
    return action.application === application
      ? null
      : {
          item: `applications/${action.application}`,
          label: 'Return to previous application',
        }
  }
  return { item: 'hall', label: 'Return to alliance' }
}
