import { useEffect, useState } from 'react'
import { oidcHttp, type OidcConfig, type OidcIdentity } from '../adapters/oidc'
export type { OidcConfig } from '../adapters/oidc'
export function useOidcConfig() {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; config: OidcConfig }
    | { status: 'error' }
  >({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void oidcHttp
      .config(controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) setState({ status: 'ready', config })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })
    return () => controller.abort()
  }, [attempt])
  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }
  return { state, retry }
}

export function oidcLoginPath(returnTo?: string, verify = false) {
  const path =
    returnTo?.startsWith('/') &&
    !returnTo.startsWith('//') &&
    !returnTo.includes('\\') &&
    Array.from(returnTo).every((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
      ? returnTo
      : '/'
  return `/api/auth/login?${new URLSearchParams({ return_to: path, ...(verify ? { verify: 'true' } : {}) })}`
}

export function useUniverseEnrollment() {
  const { state, retry } = useOidcConfig()
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  async function enroll(universe: string) {
    setBusy(true)
    try {
      await oidcHttp.enroll(universe)
      window.location.assign('/')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { state, retry, message, busy, enroll }
}

export function useAccountIdentity() {
  const { state } = useOidcConfig()
  const config = state.status === 'ready' ? state.config : null
  const [identity, setIdentity] = useState<OidcIdentity | null>(null)
  useEffect(() => {
    if (config?.mode === 'oidc')
      void oidcHttp
        .identity()
        .then(setIdentity)
        .catch(() => {})
  }, [config?.mode])
  return { config, identity }
}
