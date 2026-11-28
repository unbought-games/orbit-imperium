import { useContext, useCallback, useEffect, useRef, useState } from 'react'
import { type OidcConfig } from '../adapters/oidc'
import { OidcEntryApi, useOidcConfig } from './use-oidc'

export function hostedJoinUniverse(pathname: string): string | undefined {
  return /^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    pathname,
  )?.[1]
}

/** The return URL can only select the universe enabled for hosted enrollment. */
export function hostedEnrollmentTarget(
  config: OidcConfig,
  requested: string | undefined,
): string | undefined {
  const hosted = config.hosted_universe
  if (
    config.mode !== 'oidc' ||
    !hosted ||
    (requested !== undefined && requested !== hosted)
  )
    return undefined
  return hosted
}

export function useHostedJoin(
  universe: string | undefined,
  hasMembership: boolean,
  destination = '/',
  automatic = false,
) {
  const api = useContext(OidcEntryApi)
  const { state, retry: retryConfig } = useOidcConfig()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempted = useRef(false)
  const target =
    state.status === 'ready'
      ? hostedEnrollmentTarget(state.config, universe)
      : undefined
  const allowed = !!target

  useEffect(() => {
    if (state.status === 'ready' && (!allowed || hasMembership))
      window.location.replace(destination)
  }, [state.status, allowed, hasMembership, destination])

  const retry = useCallback(async () => {
    if (state.status === 'error') {
      retryConfig()
      return
    }
    if (!target || hasMembership || busy) return
    setBusy(true)
    setError('')
    try {
      await api.enroll(target)
      window.location.replace(destination)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to join. Please try again.',
      )
      setBusy(false)
    }
  }, [api, state.status, retryConfig, target, hasMembership, busy, destination])
  useEffect(() => {
    if (automatic && allowed && !hasMembership && !attempted.current) {
      attempted.current = true
      void retry()
    }
  }, [automatic, allowed, hasMembership, retry])

  return {
    busy,
    loading:
      state.status === 'loading' ||
      (automatic && allowed && !attempted.current) ||
      (state.status === 'ready' && (!allowed || hasMembership)),
    error:
      state.status === 'error'
        ? 'Unable to load your universe. Please try again.'
        : error ||
          'This universe is closed, full, or temporarily unavailable. Your account is ready; choose another universe or try again.',
    retry,
  }
}
