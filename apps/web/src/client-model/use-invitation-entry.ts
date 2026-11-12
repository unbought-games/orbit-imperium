import { useEffect, useState } from 'react'
import {
  communityRewardsApi,
  type CommunityInvitationPreview,
} from '../adapters/community-rewards'
import { invitationCode } from './invitation-entry'

/** Informational context only; preview failure never disables normal entry. */
export function useInvitationEntry(code: string, csrf?: string) {
  const [preview, setPreview] = useState<CommunityInvitationPreview>()
  useEffect(() => {
    if (csrf || !invitationCode(code)) return
    const abort = new AbortController()
    void communityRewardsApi('')
      .invitationPreview(code, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted && value.code === code) setPreview(value)
      })
      .catch(() => {
        /* Context is optional; Play remains available. */
      })
    return () => abort.abort()
  }, [code, csrf])
  return { preview }
}
