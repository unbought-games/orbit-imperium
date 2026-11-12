import { useCallback, useEffect, useRef, useState } from 'react'
import { oidcHttp } from '../adapters/oidc'
import { useOidcConfig } from './use-oidc'

export function hostedJoinUniverse(pathname: string): string | undefined {
  return /^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    pathname,
  )?.[1]
}

export function useHostedJoin(
  universe: string | undefined,
  hasMembership: boolean,
  destination = '/',
  automatic = false,
) {
  const { state, retry: retryConfig } = useOidcConfig()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const attempted = useRef(false)
  const target =
    universe ??
    (state.status === 'ready' ? state.config.hosted_universe : undefined)
  const allowed =
    state.status === 'ready' &&
    state.config.mode === 'oidc' &&
    !!target &&
    state.config.hosted_universe === target

  useEffect(() => {
    if (state.status === 'ready' && (!allowed || hasMembership))
      window.location.replace(destination)
  }, [state.status, allowed, hasMembership, destination])

  const retry = useCallback(async () => {
    if (state.status === 'error') {
      retryConfig()
      return
    }
    if (!allowed || !target || hasMembership || busy) return
    setBusy(true)
    setError('')
    try {
      await oidcHttp.enroll(target)
      window.location.replace(destination)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to join. Please try again.',
      )
      setBusy(false)
    }
  }, [
    state.status,
    retryConfig,
    allowed,
    target,
    hasMembership,
    busy,
    destination,
  ])
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
