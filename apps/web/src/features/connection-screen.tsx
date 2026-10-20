import { Button } from '../ui/button'
import { Eyebrow, Heading, Text } from '../ui/typography'
import { PublicFrame } from './public-frame'
import styles from './connection-screen.module.css'
export function ConnectionScreen({
  stale,
  message,
  retry,
  busy,
  logout,
}: {
  stale?: boolean
  message?: string
  retry?: () => void
  busy?: boolean
  logout?: () => Promise<void>
}) {
  const failed = !busy && (stale || message)
  return (
    <PublicFrame variant="recovery">
      <Eyebrow className={styles.eyebrow}>Orbit Imperium</Eyebrow>
      <Heading level={1} className={styles.title}>
        {failed ? 'A moment between worlds.' : 'Opening your universe.'}
      </Heading>
      {failed ? (
        <>
          <Text role="alert" className={styles.message}>
            {stale
              ? 'Connection interrupted — no confirmed universe is available.'
              : message}
          </Text>
          <div className={styles.actions}>
            {retry && <Button onClick={retry}>Retry connection</Button>}
            {logout && (
              <Button variant="quiet" onClick={() => void logout()}>
                Sign out
              </Button>
            )}
          </div>
        </>
      ) : (
        <Text role="status" className={styles.message}>
          Establishing your connection…
        </Text>
      )}
    </PublicFrame>
  )
}
