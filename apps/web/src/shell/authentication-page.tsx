import { useOidcConfig } from '../client-model/use-oidc'
import { AuthConfigError, UnboughtLogin } from '../features/oidc'
import { useEffect } from 'react'
import { Navigate } from '@tanstack/react-router'
import { Login } from '../features/login'
import { useAuthSession } from './auth-context'
import { DefaultDestination } from './default-destination'

export function AuthenticationPage({
  signup = false,
  redirect,
}: {
  signup?: boolean
  redirect?: string
}) {
  const { state: oidc, retry } = useOidcConfig()
  const { runtime, busy, message, errorRef, login, clearMessage } =
    useAuthSession()
  useEffect(() => {
    document.title = `${signup ? 'Sign up' : 'Sign in'} · Orbit Imperium`
    return clearMessage
  }, [signup, clearMessage])
  if (runtime.status === 'authenticated')
    return redirect ? (
      <Navigate to={redirect} href={redirect} replace />
    ) : (
      <DefaultDestination />
    )
  if (oidc.status === 'error') return <AuthConfigError retry={retry} />
  if (oidc.status === 'loading') return <p>Loading sign-in…</p>
  if (oidc.config.mode === 'oidc') return <UnboughtLogin redirect={redirect} />
  if (signup && !runtime.signupEnabled)
    return <Navigate to="/login" search={{ redirect }} replace />
  return (
    <Login
      busy={busy}
      signup={signup}
      redirect={redirect}
      signupEnabled={runtime.signupEnabled}
      message={message}
      errorRef={errorRef}
      onSubmit={(event) => login(event, signup)}
    />
  )
}
