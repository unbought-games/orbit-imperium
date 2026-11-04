import type { components } from '../../contracts'
import { useGameSession } from '../../shell/session-context'
import { universeSlug } from '../../client-model/universe-name'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Summary, type Run } from './shared'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
import { Recruit } from './recruit'
import styles from './alliances.module.css'
export function AllianceWelcome({
  universe,
  alliance,
  invitation,
  view,
  run,
  busy,
  error,
  retry,
  pending,
  retryCommand,
}: {
  universe: string
  alliance: string
  invitation?: string
  view: components['schemas']['AllianceView'] | null
  run: Run
  busy: boolean
  error: string
  retry: () => void
  pending: boolean
  retryCommand: () => void
}) {
  const { universeName } = useGameSession()
  const publicAlliance = usePublicAlliance(universe, alliance, invitation)
  const data = publicAlliance.data
  return (
    <div className={styles.welcome}>
      <h2>Welcome to {universeName}</h2>
      <p>
        Your empire is ready. Joining an alliance is optional—you can start
        playing whenever you like.
      </p>
      {publicAlliance.error ? (
        <>
          <p role="alert">{publicAlliance.error}</p>
          <Button onClick={publicAlliance.retry}>Retry invitation</Button>
        </>
      ) : data ? (
        <>
          <Summary summary={data.summary} />
          {data.summary.id === alliance && (
            <Recruit
              summary={data.summary}
              view={view}
              run={run}
              busy={busy}
              messageRows={3}
              initialMessage={`Hi! I’d like to join ${data.summary.name}.`}
            />
          )}
        </>
      ) : (
        <p role="status">Loading alliance…</p>
      )}
      {pending && <Button onClick={retryCommand}>Retry last command</Button>}
      {error && (
        <>
          <p role="alert">{error}</p>
          <Button
            onClick={() => {
              retry()
              publicAlliance.retry()
            }}
          >
            Refresh joining options
          </Button>
        </>
      )}
      <div className={styles.actions}>
        <ButtonLinkAnchor
          data-analytics="alliance_start_playing"
          href={`/u/${universeSlug(universeName)}/overview`}
        >
          Start playing
        </ButtonLinkAnchor>
        <ButtonLinkAnchor
          variant="secondary"
          href={`/u/${universeSlug(universeName)}/alliance`}
        >
          Browse alliances
        </ButtonLinkAnchor>
      </div>
    </div>
  )
}
