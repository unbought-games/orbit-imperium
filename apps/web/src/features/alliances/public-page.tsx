import { useEffect } from 'react'
import { LoadingRegion } from '../../ui/loading-region'
import { recruitmentEntryPath } from '../../client-model/recruitment'
import { usePublicAlliance } from '../../client-model/use-public-alliance'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { PublicAllianceTemplate } from './public-template'
import styles from './presentation.module.css'
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
    document.title = `${data?.summary.name ?? 'Alliance'} · Orbit Imperium`
  }, [data?.summary.name])
  const destination = data
    ? recruitmentEntryPath({ universe, alliance: data.summary.id, invitation })
    : ''
  return (
    <main id="main">
      <LoadingRegion loading={!data && !error} label="Loading alliance…">
        {data ? (
          <PublicAllianceTemplate
            data={data}
            signinHref={`/login?${new URLSearchParams({ redirect: destination })}`}
            action={
              <ButtonLinkAnchor
                href={`/login?${new URLSearchParams({ redirect: destination })}`}
              >
                {data.summary.recruitment === 'Open'
                  ? `Join ${data.summary.name}`
                  : data.summary.recruitment === 'Application'
                    ? `Apply to ${data.summary.name}`
                    : 'Start your empire'}{' '}
                <span aria-hidden="true">→</span>
              </ButtonLinkAnchor>
            }
          />
        ) : error ? (
          <div className={styles.loading}>
            <a href="/">Orbit Imperium</a>
            <h1>Alliance unavailable</h1>
            <p role="alert">{error}</p>
            <Button onClick={retry}>Retry</Button>
            <p>
              <a href={`/alliances/${universe}`}>Explore other alliances</a>
            </p>
          </div>
        ) : null}
      </LoadingRegion>
    </main>
  )
}
