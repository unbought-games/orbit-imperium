import { useEffect } from 'react'
import { useAuthSession } from '../shell/auth-context'
import { DefaultDestination } from '../shell/default-destination'
import { PublicFrame } from './public-frame'
import { Link } from '../ui/link'
import { ButtonLink } from '../ui/button'
import { Heading, Text, Eyebrow } from '../ui/typography'
import styles from './login.module.css'

export function Home() {
  const { runtime } = useAuthSession()
  useEffect(() => {
    document.title = 'Orbit Imperium'
  }, [])
  if (runtime.status === 'authenticated') return <DefaultDestination />
  return (
    <PublicFrame variant="landing">
      <Eyebrow className={styles.eyebrow}>A universe of possibility</Eyebrow>
      <Heading level={1} className={styles.title}>
        Your foothold in the stars.
      </Heading>
      <Text className={styles.introduction}>
        Build an economy. Advance your technology. Send your fleet toward a
        larger horizon.
      </Text>
      <nav aria-label="Get started" className={styles.actions}>
        {runtime.signupEnabled && (
          <ButtonLink className={styles.primary} to="/signup">
            Create an account
          </ButtonLink>
        )}
        {runtime.signupEnabled ? (
          <Link to="/login">
            Sign in <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <ButtonLink className={styles.primary} to="/login">
            Sign in
          </ButtonLink>
        )}
      </nav>
      <p className={styles.statement}>Every advantage is earned.</p>
      <nav aria-label="News and community" className={styles.community}>
        <a className={styles.updates} href="/updates/index.html">
          What’s New <span aria-hidden="true">→</span>
        </a>
        <a
          className={styles.repository}
          href="https://github.com/unbought-games/orbit-imperium"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="currentColor"
          >
            <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.023-.7.077-.686.077-.686 1.13.08 1.724 1.16 1.724 1.16 1.006 1.724 2.64 1.226 3.282.938.102-.73.394-1.226.716-1.508-2.498-.284-5.124-1.25-5.124-5.565 0-1.23.44-2.232 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.153A10.8 10.8 0 0 1 12 6.18c.956.004 1.918.13 2.817.378 2.148-1.456 3.092-1.153 3.092-1.153.615 1.55.228 2.695.112 2.98.722.788 1.158 1.79 1.158 3.02 0 4.327-2.63 5.278-5.136 5.557.404.35.764 1.042.764 2.1 0 1.516-.014 2.738-.014 3.11 0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
          </svg>
          View on GitHub
        </a>
      </nav>
    </PublicFrame>
  )
}
