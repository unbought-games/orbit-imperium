import type { RecruitmentEntry } from '../../client-model/recruitment'
import { useRecruitmentEntry } from '../../client-model/use-recruitment-entry'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Summary } from './shared'
import styles from './alliances.module.css'
export function RecruitmentEntryPage({
  entry,
  memberships,
}: {
  entry: RecruitmentEntry
  memberships: { universe: string; universe_name: string }[]
}) {
  const { data, error, retry } = usePublicAlliance(
    entry.universe,
    entry.alliance,
    entry.invitation,
  )
  const membership = memberships.find((m) => m.universe === entry.universe)
  const valid = !!data && data.summary.id === entry.alliance
  const enrollment = useRecruitmentEntry(entry, membership, valid)
  return (
    <main id="main-content" className={styles.publicPage}>
      <a className={styles.brand} href="/">
        Orbit Imperium
      </a>
      <h1>Your world awaits.</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <Button onClick={retry}>Retry invitation</Button>
        </>
      ) : data ? (
        <>
          <Summary summary={data.summary} />
          {!valid ? (
            <p role="alert">
              This invitation no longer points to the selected alliance. Open a
              current invitation to continue.
            </p>
          ) : membership ? (
            <p role="status">Opening your alliance welcome…</p>
          ) : (
            <>
              <p>
                Begin your arrival in <strong>{data.universe_name}</strong>.
                Your guide will help you{' '}
                {data.summary.recruitment === 'Application'
                  ? 'apply to'
                  : 'join'}{' '}
                {data.summary.name} once you’ve named your world.
              </p>
              {data.enrollment_open ? (
                <Button
                  disabled={enrollment.busy}
                  onClick={() => void enrollment.enroll()}
                >
                  {enrollment.busy
                    ? 'Preparing your world…'
                    : 'Begin your arrival'}
                </Button>
              ) : (
                <p>
                  This universe is closed or full. You can try again later or
                  choose another universe.
                </p>
              )}
              {enrollment.error && <p role="alert">{enrollment.error}</p>}
            </>
          )}
        </>
      ) : (
        <p role="status">Loading your destination…</p>
      )}
      <ButtonLinkAnchor variant="secondary" href="/alliances">
        Browse other alliances
      </ButtonLinkAnchor>
      <ButtonLinkAnchor variant="secondary" href="/">
        Back to Orbit Imperium
      </ButtonLinkAnchor>
    </main>
  )
}
