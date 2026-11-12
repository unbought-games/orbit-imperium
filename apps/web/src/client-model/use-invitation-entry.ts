import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  communityRewardsApi,
  type CommunityInvitationPreview,
} from '../adapters/community-rewards'
import { CommunityRewardsController } from './community-rewards'
import { clearRememberedInvitation } from './community-invitation'
import { invitationCode } from './invitation-entry'

/** Mounted with an authentication key: anonymous previews never authorize acceptance. */
export function useInvitationEntry(code: string, csrf?: string) {
  const [controller] = useState(
    () => new CommunityRewardsController(communityRewardsApi(csrf ?? '')),
  )
  const state = useStore(controller.store)
  const [preview, setPreview] = useState<CommunityInvitationPreview>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const accepted = preview?.accepted === true
  const retryPreview = () => setAttempt((value) => value + 1)
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true)
    setPreview(undefined)
    setError('')
    if (!invitationCode(code)) {
      setLoading(false)
      setError(
        'This invitation is not available. Ask your friend for a new link.',
      )
      return () => abort.abort()
    }
    void controller.api
      .invitationPreview(code, abort.signal)
      .then((value) => {
        if (abort.signal.aborted) return
        if (value.game_id !== 'orbit-imperium' || value.code !== code)
          throw Error('Invalid destination')
        setPreview(value)
        if (value.attribution_locked) {
          try {
            clearRememberedInvitation(localStorage, code)
          } catch {
            /* Optional recall only. */
          }
        }
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError(
            'This invitation could not be checked. Try again or ask your friend for a new link.',
          )
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [code, attempt, controller])
  useEffect(() => controller.stop, [controller])
  async function accept() {
    if (
      !csrf ||
      !preview ||
      preview.requires_game_check ||
      preview.attribution_locked
    )
      return
    const result = await controller.act({
      type: 'accept_invitation',
      code,
      preview_version: preview.preview_version,
    })
    if (result) {
      setPreview(undefined)
      setLoading(true)
      retryPreview()
      try {
        clearRememberedInvitation(localStorage, code)
      } catch {
        /* Optional recall only. */
      }
    } else if (!controller.store.getState().pending) {
      // A changed/denied attribution requires a new visible preview and confirmation.
      retryPreview()
    }
  }
  return {
    ...state,
    preview,
    loading,
    previewError: error,
    accepted,
    accept,
    retryPreview,
  }
}
