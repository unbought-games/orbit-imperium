import { ShareLink } from './share-link'
import type { HistoricalDetail } from '../../adapters/empire-history'
import { useArchive } from '../../client-model/use-empire-history'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { ReportObservation } from '../report-observation'
import {
  eventCommander,
  eventDate,
  eventSummary,
  eventTitle,
} from './presentation'
import styles from './history.module.css'
export function CommemorationPage({ publication }: { publication: string }) {
  const { data, error, retry } = useArchive<HistoricalDetail>(
    'HistoricalDetail',
    `/api/v4/commemorations/${publication}`,
  )
  return (
    <main id="main-content" className={styles.page}>
      <nav className={styles.top}>
        <a href="/">Orbit Imperium</a>
        <a href="/profile">My Orbit profile</a>
      </nav>
      {error ? (
        <div role="alert">
          {error} <Button onClick={retry}>Retry</Button>
        </div>
      ) : !data ? (
        <p role="status">Opening the commemorative record…</p>
      ) : (
        <>
          <article className={`${styles.hero} ${styles.keepsake}`}>
            <p className={styles.eyebrow}>
              {data.universe_name} · Commemorative record
            </p>
            {eventCommander(data.entry, data.player) && (
              <p>{eventCommander(data.entry, data.player)}</p>
            )}
            <time>{eventDate(data.entry.at_ms)}</time>
            <h1>{eventTitle(data.entry)}</h1>
            {data.entry.correction && (
              <p>Record corrected: {data.entry.correction}</p>
            )}
            <p className={styles.lede}>{eventSummary(data.entry)}</p>
            {data.entry.caption && (
              <p className={styles.caption}>{data.entry.caption}</p>
            )}
            <p className={styles.hint}>
              A lasting record of a real moment in Orbit Imperium.
            </p>
          </article>
          {data.report && (
            <section className={styles.details} aria-label="Recorded battle">
              <h2>The battle</h2>
              <p>
                Recorded from one participant’s observation. “Your” refers to
                that participant.
              </p>
              <ReportObservation
                payload={data.report.payload}
                playerNames={data.report.player_names}
                playerAlliances={data.report.player_alliances}
                shared
              />
            </section>
          )}
          <div className={styles.actions}>
            <ShareLink
              path={`/commemorations/${publication}`}
              label="Copy card link"
            />
            <Button variant="secondary" onClick={() => window.print()}>
              Print this keepsake
            </Button>
            <ButtonLinkAnchor href="/alliances">
              Join the next story
            </ButtonLinkAnchor>
          </div>
        </>
      )}
    </main>
  )
}
