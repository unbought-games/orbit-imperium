import { PublicFrame } from './public-frame'
import { Heading, Text } from '../ui/typography'
import {
  useUniverseEnrollment,
  useAccountIdentity,
  oidcLoginPath,
} from '../client-model/use-oidc'
import styles from './oidc.module.css'
export function UnboughtLogin({ redirect }: { redirect?: string }) {
  return (
    <PublicFrame>
      <Heading level={1}>Your world awaits.</Heading>
      <Text>
        One username across unbought games. Sign in or create an account to
        continue.
      </Text>
      <a href={oidcLoginPath(redirect)}>Continue with Unbought</a>
      <p>
        <a href={oidcLoginPath(redirect)}>Create an account</a>
      </p>
    </PublicFrame>
  )
}
export function UniverseEnrollment() {
  const { state, retry, message, busy, enroll } = useUniverseEnrollment()
  if (state.status === 'error') return <AuthConfigError retry={retry} />
  return (
    <PublicFrame>
      <Heading level={1}>Choose your universe</Heading>
      <Text>
        Your account is ready. Join a universe to begin. Email verification is
        optional.
      </Text>
      {state.status === 'ready' &&
        state.config.universes.map((id) => (
          <p key={id}>
            <button disabled={busy} onClick={() => void enroll(id)}>
              Join universe {id}
            </button>
          </p>
        ))}
      {message && <p role="alert">{message}</p>}
    </PublicFrame>
  )
}
export function AccountIdentity() {
  const { config, identity } = useAccountIdentity()
  if (!identity || !config?.accounts_url) return null
  return (
    <aside className={styles.identity} aria-label="Unbought account">
      <span>{identity.username}</span>
      {!identity.email_verified && (
        <>
          {' '}
          ·{' '}
          <a
            href={`${config.accounts_url}/verify-email?${new URLSearchParams({ client_id: config.client_id ?? '', return_path: window.location.pathname + window.location.search })}`}
          >
            Verify email
          </a>{' '}
          ·{' '}
          <a
            href={oidcLoginPath(
              window.location.pathname + window.location.search,
              true,
            )}
          >
            I’ve verified — continue
          </a>
        </>
      )}{' '}
      ·{' '}
      <a href={`${config.accounts_url}/account/sessions`}>
        Sign out everywhere
      </a>
    </aside>
  )
}

export function AuthConfigError({ retry }: { retry: () => void }) {
  return (
    <PublicFrame>
      <p role="alert">Unable to load sign-in options. Please try again.</p>
      <button onClick={retry}>Try again</button>
    </PublicFrame>
  )
}
