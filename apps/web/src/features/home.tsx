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
    </PublicFrame>
  )
}
