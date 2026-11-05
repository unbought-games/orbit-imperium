import { ShareLink } from './share-link'
import { useIdentityTitle } from '../../client-model/use-identity-title'
import type { EmpireProfile, OrbitProfile } from '../../adapters/empire-history'
import { useArchive } from '../../client-model/use-empire-history'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import styles from './history.module.css'
export function OrbitProfilePage({ profile }: { profile?: string }) {
  const { data, error, retry } = useArchive<OrbitProfile>(
    'OrbitProfile',
    profile ? `/api/v4/orbit-profiles/${profile}` : '/api/v4/my-profile',
  )
  return (
    <main id="main-content" className={styles.page}>
      <nav className={styles.top}>
        <a href="/">Orbit Imperium</a>
        <a href="/profile">My Orbit profile</a>
      </nav>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Across the universes</p>
        <h1>{data?.empires[0]?.username ?? 'Orbit profile'}</h1>
        <p className={styles.lede}>
          {data?.owner
            ? 'Your empires. Your history. Choose the stories you share.'
            : 'Explore the campaigns this commander has chosen to share.'}
        </p>
      </header>
      {error ? (
        <div role="alert">
          {error} <Button onClick={retry}>Retry</Button>{' '}
          <a href={`/login?${new URLSearchParams({ redirect: '/profile' })}`}>
            Sign in
          </a>
        </div>
      ) : !data ? (
        <p role="status">Loading profiles…</p>
      ) : (
        <>
          {data.owner && (
            <p>
              Only public universe profiles appear here for other visitors.{' '}
              <a href={`/profiles/${data.id}`}>Your lasting profile link</a>
            </p>
          )}
          <div className={styles.grid}>
            {data.empires.map((empire) => (
              <article className={styles.event} key={empire.player}>
                <p className={styles.eyebrow}>
                  {empire.closed
                    ? 'Concluded campaign'
                    : empire.removed
                      ? 'Former empire'
                      : 'Universe'}
                </p>
                <h2>{empire.universe_name}</h2>
                <EmpireSummaryIdentity empire={empire} />
                {data.owner && (
                  <p>
                    {empire.removed
                      ? 'Private archive'
                      : empire.public
                        ? 'Public profile'
                        : 'Visible within the universe'}
                  </p>
                )}
                <ButtonLinkAnchor
                  href={`/profiles/empire/${empire.player}`}
                  variant="secondary"
                >
                  Explore this empire
                </ButtonLinkAnchor>
              </article>
            ))}
          </div>
          {data.empires.length === 0 && <p>No empire profiles yet.</p>}
        </>
      )}
      <div className={styles.actions}>
        {data && data.empires.some((e) => e.public) && (
          <ShareLink path={`/profiles/${data.id}`} />
        )}
        <ButtonLinkAnchor href="/alliances">
          Find a universe and a crew
        </ButtonLinkAnchor>
      </div>
    </main>
  )
}

function EmpireSummaryIdentity({ empire }: { empire: EmpireProfile }) {
  const title = useIdentityTitle(empire.title)
  return (
    <>
      {empire.identity?.name && <p>{empire.identity.name}</p>}
      <p>
        {title.label} {empire.username}
      </p>
      {empire.identity?.tagline && (
        <p className={styles.lede}>{empire.identity.tagline}</p>
      )}
    </>
  )
}
