import type { components } from '../contracts'
export type EmpireIdentity = components['schemas']['EmpireIdentity']
export type TitleDisplay = components['schemas']['TitleDisplay']
export type TitleChoice = components['schemas']['TitleChoice']
export const defaultIdentity: EmpireIdentity = {
  name: '',
  tagline: '',
  title_id: 'commander',
}
export const defaultTitle: TitleDisplay = {
  id: 'commander',
  label: 'Commander',
  address: 'Commander',
  expires_at: null,
}
export function effectiveTitle(
  title: TitleDisplay | undefined,
  now: number,
): TitleDisplay {
  return title && (title.expires_at === null || title.expires_at * 1000 > now)
    ? title
    : defaultTitle
}
export function titleAvailability(choice: TitleChoice['availability']) {
  return {
    available: 'Available',
    supporter_required: 'Supporter title',
    earned_required: 'Earned through achievements',
    unavailable: 'Supporter status temporarily unavailable',
    not_installed: 'Not installed on this server',
  }[choice]
}
export function identityError(identity: EmpireIdentity) {
  if (Array.from(identity.name).length > 60)
    return 'Empire names can contain up to 60 characters.'
  if (Array.from(identity.tagline).length > 160)
    return 'Taglines can contain up to 160 characters.'
  // Match server plain-text validation, including invisible direction overrides.
  if (
    /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(identity.name + identity.tagline)
  )
    return 'Use plain text without control characters.'
  return ''
}
export function addressCaption(text: string, address: string) {
  // Copy opts into direct address; status updates and asides stay as written.
  return text.replaceAll('{address}', () => address)
}
