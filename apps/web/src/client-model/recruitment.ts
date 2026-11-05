import type { components } from '../contracts'
type S = components['schemas']
export type RecruitmentProfile = S['RecruitmentProfile']
export const emptyRecruitment: RecruitmentProfile = {
  listed: false,
  languages: null,
  beginners: null,
  activity: null,
}
// Stable values are independent of labels. Add future preferences in this model,
// the contract and domain policy; unset preferences never imply a match.
export const experienceOptions = [
  { value: 'Welcome', label: 'Beginners welcome' },
  { value: 'Experienced', label: 'Experienced players preferred' },
] as const
export const activityOptions = [
  { value: 'Flexible', label: 'Play whenever you like' },
  { value: 'Weekly', label: 'Play at least weekly' },
  { value: 'Daily', label: 'Daily play expected' },
] as const
export const languageOptions = [
  ['en', 'English'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['pt', 'Português'],
  ['it', 'Italiano'],
  ['nl', 'Nederlands'],
  ['pl', 'Polski'],
  ['uk', 'Українська'],
  ['ru', 'Русский'],
  ['tr', 'Türkçe'],
  ['ar', 'العربية'],
  ['hi', 'हिन्दी'],
  ['zh', '中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
] as const
export function languageName(code: string) {
  return languageOptions.find(([value]) => value === code)?.[1] ?? code
}
export function recruitmentFromForm(data: FormData): RecruitmentProfile {
  const languages = data.getAll('languages').map(String)
  const beginners =
    experienceOptions.find(({ value }) => value === data.get('beginners'))
      ?.value ?? null
  const activity =
    activityOptions.find(({ value }) => value === data.get('activity'))
      ?.value ?? null
  return {
    listed: data.has('listed'),
    languages: languages.length ? languages : null,
    beginners,
    activity,
  }
}
export type RecruitmentEntry = {
  universe: string
  alliance: string
  invitation?: string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function recruitmentEntry(href: string): RecruitmentEntry | null {
  const url = new URL(href, 'https://orbit.invalid')
  if (url.origin !== 'https://orbit.invalid') return null
  if (url.pathname === '/login' || url.pathname === '/signup') {
    const redirect = url.searchParams.get('redirect')
    return redirect?.startsWith('/join/') ? recruitmentEntry(redirect) : null
  }
  const universe = /^\/join\/([^/]+)$/.exec(url.pathname)?.[1]
  const alliance = url.searchParams.get('alliance')
  const invitation = url.searchParams.get('invitation') ?? undefined
  if (
    !universe ||
    !uuid.test(universe) ||
    !alliance ||
    !uuid.test(alliance) ||
    (invitation && !uuid.test(invitation))
  )
    return null
  return { universe, alliance, invitation }
}
export function recruitmentEntryPath(entry: RecruitmentEntry) {
  return `/join/${entry.universe}?${new URLSearchParams({ alliance: entry.alliance, ...(entry.invitation ? { invitation: entry.invitation } : {}) })}`
}

// TanStack decodes numeric query values before validation. Preserve the same
// entry intent both before and after its normal planet-selection redirect.
export function allianceSearch(search: Record<string, unknown>): {
  alliance?: string
  welcome?: string
  invitation?: string
} {
  if (search.alliance === undefined) return {}
  if (typeof search.alliance !== 'string' || !uuid.test(search.alliance))
    throw new Error('This address contains an invalid alliance.')
  if (
    search.invitation !== undefined &&
    (typeof search.invitation !== 'string' || !uuid.test(search.invitation))
  )
    throw new Error('This address contains an invalid invitation.')
  return {
    alliance: search.alliance,
    welcome: search.welcome === 1 || search.welcome === '1' ? '1' : undefined,
    invitation: search.invitation as string | undefined,
  }
}
