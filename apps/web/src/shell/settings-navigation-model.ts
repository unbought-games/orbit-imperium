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
