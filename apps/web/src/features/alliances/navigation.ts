import type { AllianceDetail } from '../../client-model/alliances'
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
