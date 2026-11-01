import { useHostedJoin } from '../client-model/use-hosted-join'
import { PublicFrame } from './public-frame'
import { Heading, Text } from '../ui/typography'
import { Button, ButtonLinkAnchor } from '../ui/button'
import styles from './login.module.css'
import joinStyles from './hosted-join.module.css'

export function HostedJoin({
  universe,
  hasMembership,
}: {
  universe: string
  hasMembership: boolean
}) {
  const { loading, busy, error, retry } = useHostedJoin(universe, hasMembership)
  return (
    <PublicFrame>
      <Heading level={1}>Your account is ready.</Heading>
      <Text
        className={joinStyles.message}
        role={loading || busy ? 'status' : 'alert'}
      >
        {loading
          ? 'Checking your universe…'
          : busy
            ? 'Joining the current universe. You’ll enter the game automatically.'
            : error}
      </Text>
      <div className={styles.actions}>
        <Button variant="primary" onClick={retry} disabled={loading || busy}>
          {busy ? 'Joining…' : 'Try again'}
        </Button>
        <ButtonLinkAnchor variant="secondary" href="/">
          Choose a universe
        </ButtonLinkAnchor>
      </div>
    </PublicFrame>
  )
}
