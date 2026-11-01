import { useEffect, useState } from 'react'
import { oidcHttp } from '../adapters/oidc'
import { useOidcConfig } from './use-oidc'

export function hostedJoinUniverse(pathname: string): string | undefined {
  return /^\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(
    pathname,
  )?.[1]
}

export function useHostedJoin(universe: string, hasMembership: boolean) {
  const { state, retry: retryConfig } = useOidcConfig()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allowed =
    state.status === 'ready' &&
    state.config.mode === 'oidc' &&
    state.config.hosted_universe === universe

  useEffect(() => {
    if (state.status === 'ready' && (!allowed || hasMembership))
      window.location.replace('/')
  }, [state.status, allowed, hasMembership])

  async function retry() {
    if (state.status === 'error') {
      retryConfig()
      return
    }
    if (!allowed || hasMembership || busy) return
    setBusy(true)
    setError('')
    try {
      await oidcHttp.enroll(universe)
      window.location.replace('/')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to join. Please try again.',
      )
      setBusy(false)
    }
  }

  return {
    busy,
    loading:
      state.status === 'loading' ||
      (state.status === 'ready' && (!allowed || hasMembership)),
    error:
      state.status === 'error'
        ? 'Unable to load your universe. Please try again.'
        : error ||
          'This universe is closed, full, or temporarily unavailable. Your account is ready; choose another universe or try again.',
    retry,
  }
}
