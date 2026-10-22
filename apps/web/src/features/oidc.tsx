import { PublicFrame } from './public-frame'
import { Heading, Text } from '../ui/typography'
import { ButtonLinkAnchor } from '../ui/button'
import { useUniverseEnrollment, oidcLoginPath } from '../client-model/use-oidc'
import styles from './login.module.css'
export function UnboughtLogin({ redirect }: { redirect?: string }) {
  return (
    <PublicFrame>
      <Heading level={1}>Your world awaits.</Heading>
      <Text>
        One username across unbought games. Sign in or create an account to
        continue.
      </Text>
      <div className={styles.actions}>
        <ButtonLinkAnchor
          className={`${styles.primary} ${styles.accountAction}`}
          data-analytics="continue_with_account"
          href={oidcLoginPath(redirect)}
        >
          Continue with your Unbought Account
        </ButtonLinkAnchor>
      </div>
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
        state.config.universes.map(({ universe, name }) => (
          <p key={universe}>
            <button
              data-analytics="enroll_universe"
              disabled={busy}
              onClick={() => void enroll(universe)}
            >
              Join {name}
            </button>
          </p>
        ))}
      {message && <p role="alert">{message}</p>}
    </PublicFrame>
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
