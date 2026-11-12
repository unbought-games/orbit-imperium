import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import type { AppRuntime } from '../adapters/runtime'
import { communityRewardsApi } from '../adapters/community-rewards'
import { commandId } from '../adapters/command-id'
import { rememberInvitation } from './community-invitation'
import {
  invitationCode,
  allianceInvitationContinuation,
} from './invitation-entry'
import { InvitationDelivery } from './invitation-delivery'

export function useInvitationDelivery(runtime: AppRuntime) {
  const entry = useLocation({
    select: (location) => {
      try {
        const url = new URL(location.href, 'https://orbit.invalid')
        const pathCode = /^\/invite\/([^/]+)\/?$/.exec(url.pathname)?.[1]
        const code = pathCode
          ? decodeURIComponent(pathCode)
          : allianceInvitationContinuation(url.pathname)
            ? url.searchParams.get('rewards_invitation')
            : null
        return code && invitationCode(code) ? code : undefined
      } catch {
        return undefined
      }
    },
  })
  const account =
    runtime.status === 'authenticated' ? runtime.session.account : undefined
  const csrf =
    runtime.status === 'authenticated' ? runtime.session.csrf : undefined
  useEffect(() => {
    try {
      if (entry) rememberInvitation(localStorage, entry)
    } catch {
      /* Entry itself remains available without storage. */
    }
    if (!account || !csrf) return
    const abort = new AbortController()
    let delivery: InvitationDelivery
    try {
      const api = communityRewardsApi(csrf)
      delivery = new InvitationDelivery(
        localStorage,
        (request, signal) =>
          api.act(
            {
              contract_version: 1,
              request_id: request.request_id,
              action: { type: 'apply_invitation', code: request.code },
            },
            signal,
            true,
          ),
        () => commandId(crypto),
      )
    } catch {
      return
    }
    let attempts = 0
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => {
      if (stopped || document.visibilityState === 'hidden') return
      void delivery.attempt(account, abort.signal)
    }
    const retry = () => {
      wake()
      if (++attempts < 5) timer = setTimeout(retry, 30_000)
    }
    retry()
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      // Let the small idempotent keepalive write finish during normal navigation.
      // Its request stays bound to the original account and has a network deadline.
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [account, csrf, entry])
}
