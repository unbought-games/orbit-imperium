import { trackRecruitment } from '../adapters/optional-services'
import { useEffect, useState } from 'react'
import { oidcHttp } from '../adapters/oidc'
import { universeSlug } from './universe-name'
import { recruitmentEntryPath, type RecruitmentEntry } from './recruitment'
export function allianceWelcomePath(
  universeName: string,
  entry: RecruitmentEntry,
) {
  return `/u/${universeSlug(universeName)}/alliance?${new URLSearchParams({ alliance: entry.alliance, welcome: '1', ...(entry.invitation ? { invitation: entry.invitation } : {}) })}`
}
export function useRecruitmentEntry(
  entry: RecruitmentEntry,
  membership: { universe_name: string } | undefined,
  valid: boolean,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const target =
    membership && valid
      ? allianceWelcomePath(membership.universe_name, entry)
      : null
  useEffect(() => {
    if (target) window.location.replace(target)
  }, [target])
  async function enroll() {
    if (busy || membership || !valid) return
    setBusy(true)
    setError('')
    try {
      await oidcHttp.enroll(entry.universe)
      trackRecruitment('enrolled')
      window.location.replace(recruitmentEntryPath(entry))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to enroll. Please try again.',
      )
      setBusy(false)
    }
  }
  return { busy, error, enroll }
}
