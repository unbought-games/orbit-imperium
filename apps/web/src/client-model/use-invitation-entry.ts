import { useCallback, useEffect, useRef, useState } from 'react'
import {
  communityRewardsApi,
  type GameInvitationPresentation,
} from '../adapters/community-rewards'
import { oidcHttp } from '../adapters/oidc'
import { invitationCode, boundInvitationPath } from './invitation-entry'
import { rememberInvitation } from './community-invitation'

export function useInvitationEntry(
  code: string,
  authenticated: boolean,
  continuation?: string,
) {
  const [preview, setPreview] = useState<GameInvitationPresentation>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    const abort = new AbortController()
    if (!invitationCode(code)) {
      setLoading(false)
      return
    }
    setLoading(true)
    void communityRewardsApi('')
      .invitation(code, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted && value.code === code) setPreview(value)
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError('Your invitation could not be loaded. Please try again.')
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false)
      })
    return () => abort.abort()
  }, [code, attempt])
  const enter = useCallback(async () => {
    if (
      !authenticated ||
      !preview?.universe ||
      preview.status !== 'ready' ||
      busy
    )
      return
    setBusy(true)
    setError('')
    try {
      rememberInvitation(localStorage, code)
    } catch {
      /* Referral storage never gates entry. */
    }
    try {
      // Even existing members send the bound code: the mutation boundary must
      // reject a reset epoch rather than silently entering a replacement world.
      await oidcHttp.enroll(preview.universe.id, undefined, code)
      window.location.replace(boundInvitationPath(preview, continuation))
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'This invitation’s universe cannot be joined right now.',
      )
      setBusy(false)
    }
  }, [authenticated, preview, busy, code, continuation])
  useEffect(() => {
    if (
      authenticated &&
      preview?.status === 'ready' &&
      preview.universe &&
      !started.current
    ) {
      started.current = true
      void enter()
    }
  }, [authenticated, preview, enter])
  return {
    preview,
    loading,
    error,
    busy,
    enter,
    retry: () => {
      setError('')
      setAttempt((value) => value + 1)
    },
  }
}
