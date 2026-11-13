import type { BoundView } from '../client-model/commands'

export const settingsSections = {
  identity: 'Empire identity',
  game: 'Game settings',
  support: 'Help & community',
  session: 'Account & session',
  deletion: 'Empire deletion',
} as const
export type SettingsSection = keyof typeof settingsSections

export function isSettingsSection(value: string): value is SettingsSection {
  return Object.hasOwn(settingsSections, value)
}

export function settingsSectionAvailable(
  section: SettingsSection,
  protocol: BoundView['protocol'],
) {
  return section !== 'deletion' || protocol === 4
}

/** Retired bookmarks are input-only; new links always use section paths. */
export function settingsEntryTarget(
  desktop: boolean,
  hash: string,
): { section: SettingsSection; hash: string } | undefined {
  if (hash === 'galaxy-espionage') return { section: 'game', hash: '' }
  if (desktop) return { section: 'identity', hash }
  return undefined
}
