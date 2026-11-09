import { LoadingRegion } from '../../ui/loading-region'
import { recruitmentEntryPath } from '../../client-model/recruitment'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
import { useEffect } from 'react'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Markdown, Summary } from './shared'
import { RecruitmentImage } from './recruitment-image'
import styles from './alliances.module.css'
export function PublicAlliancePage({
  universe,
  alliance,
  invitation,
}: {
  universe: string
  alliance: string
  invitation?: string
}) {
  const { data, error, retry } = usePublicAlliance(
    universe,
    alliance,
    invitation,
  )
  useEffect(() => {
    document.title = `${data?.summary.name ?? 'Alliance invitation'} · Orbit Imperium`
  }, [data?.summary.name])
  const destination = data
    ? recruitmentEntryPath({ universe, alliance: data.summary.id, invitation })
    : ''
  return (
    <main id="main-content" className={styles.publicPage}>
      <a className={styles.brand} href="/">
        Orbit Imperium
      </a>
      <h1>{invitation ? 'You’re invited' : 'Alliance recruitment'}</h1>
      <LoadingRegion
        contentClassName={`${styles.stack} ${styles.publicCopy}`}
        loading={!data && !error}
        label="Loading alliance…"
      >
        {error ? (
          <>
            <p role="alert">{error}</p>
            <Button onClick={retry}>Retry</Button>
          </>
        ) : data ? (
          <>
            <p>
              Build an empire among the stars in a fair browser strategy game.
              Find your people in{' '}
              <strong>{data.universe_name ?? 'this universe'}</strong>.
            </p>
            <Summary summary={data.summary} />
            <section className={styles.card}>
              <Markdown
                text={
                  data.public_text ||
                  'This alliance has not published a recruitment message.'
                }
              />
            </section>
            {data.enrollment_open === false && (
              <p>
                New enrollment is currently unavailable in this universe.
                Existing players can still sign in.
              </p>
            )}
            <p>
              {data.summary.recruitment === 'Closed'
                ? 'This alliance is not accepting new members right now. You can still play independently.'
                : data.summary.recruitment === 'Open'
                  ? 'Join this universe, then choose whether to join the alliance. Membership is optional.'
                  : 'Join this universe, then send an application if you’d like to join the alliance. Approval is required.'}
            </p>
            <ButtonLinkAnchor
              href={`/login?${new URLSearchParams({ redirect: destination })}`}
            >
              Continue to {data.universe_name ?? 'this universe'}
            </ButtonLinkAnchor>
            <p className={styles.meta}>
              Sign in or create an account to continue. Ordinary enrollment and
              joining rules apply.
            </p>
            <RecruitmentImage
              path={
                invitation
                  ? `/invite/${universe}/${invitation}`
                  : `/alliances/${universe}/${alliance}`
              }
              name={data.summary.name}
              tag={data.summary.tag}
            />
            <p className={styles.meta}>
              The roster, member activity and alliance noticeboard are private.
            </p>
          </>
        ) : null}
      </LoadingRegion>
      <a className={styles.brand} href={`/alliances/${universe}`}>
        Browse recruiting alliances
      </a>
    </main>
  )
}
