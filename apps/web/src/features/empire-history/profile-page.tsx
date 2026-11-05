import { ShareLink } from './share-link'
import { useEffect, useState } from 'react'
import type { EmpireProfile } from '../../adapters/empire-history'
import { useArchive } from '../../client-model/use-empire-history'
import { universeSlug } from '../../client-model/universe-name'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { EmpireInsignia } from '../empire-insignia'
import { SupporterIdentity } from '../supporter-identity'
import { TimelineEntry } from './entry'
import styles from './history.module.css'

export function EmpireProfilePage({ player }: { player: string }) {
  const [library, setLibrary] = useState(false)
  const [before, setBefore] = useState<string>()
  const query = new URLSearchParams({
    library: String(library),
    ...(before ? { before } : {}),
  })
  const {
    data: profile,
    session,
    loading,
    error,
    busy,
    save,
    retry,
  } = useArchive<EmpireProfile>(
    'EmpireProfile',
    `/api/v4/empire-profiles/${player}?${query}`,
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    document.title = `${profile?.username ?? 'Empire profile'} · Orbit Imperium`
    const expires = profile?.display?.expires_at
    if (!expires) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expires * 1000 - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [profile])
  const display =
    profile?.display && profile.display.expires_at * 1000 > now
      ? profile.display
      : null
  const member = session?.memberships.some(
    (m) => m.universe === profile?.universe,
  )
  return (
    <main id="main-content" className={styles.page}>
      <nav className={styles.top}>
        <a href="/">Orbit Imperium</a>
        <a href="/profile">My Orbit profile</a>
      </nav>
      {error && (
        <div className={styles.error} role="alert">
          {error} <Button onClick={retry}>Refresh</Button>
          {!session && (
            <a
              href={`/login?${new URLSearchParams({ redirect: `/profiles/empire/${player}` })}`}
            >
              Sign in
            </a>
          )}
        </div>
      )}
      {!profile ? (
        <p role="status">
          {error ? 'The profile could not be opened.' : 'Opening the archive…'}
        </p>
      ) : (
        <>
          <header className={styles.hero}>
            <p className={styles.eyebrow}>
              {profile.universe_name} ·{' '}
              {profile.closed
                ? 'Concluded campaign'
                : profile.removed
                  ? 'Former empire'
                  : 'Empire profile'}
            </p>
            <div className={styles.identity}>
              {display?.insignia && (
                <EmpireInsignia appearance={display.insignia} size="medium" />
              )}
              <h1>
                <SupporterIdentity
                  name={display?.username ?? profile.username}
                  tier={display?.supporter_tier}
                />
              </h1>
            </div>
            {profile.alliance && (
              <p>
                <a
                  href={`/alliances/${profile.universe}/${profile.alliance.id}`}
                >
                  [{profile.alliance.tag}] {profile.alliance.name}
                </a>
              </p>
            )}
            <p className={styles.lede}>
              An empire’s story, told through the moments its commander chose to
              keep.
            </p>
            <div className={styles.actions}>
              {profile.public && (
                <ShareLink path={`/profiles/empire/${profile.player}`} />
              )}
              <ButtonLinkAnchor
                variant="secondary"
                href={`/profiles/${profile.profile}`}
              >
                Orbit profile
              </ButtonLinkAnchor>
              {member &&
                !profile.owner &&
                !profile.closed &&
                !profile.removed && (
                  <ButtonLinkAnchor
                    variant="secondary"
                    href={`/u/${universeSlug(profile.universe_name)}/messages?player=${profile.player}`}
                  >
                    Message &amp; friend options
                  </ButtonLinkAnchor>
                )}
              <ButtonLinkAnchor
                href={
                  profile.closed || profile.removed
                    ? '/alliances'
                    : `/join/${profile.universe}`
                }
              >
                {profile.closed || profile.removed
                  ? 'Find your next universe'
                  : `Play in ${profile.universe_name}`}
              </ButtonLinkAnchor>
            </div>
          </header>
          {profile.owner && (
            <section
              className={styles.controls}
              aria-label="Profile visibility"
            >
              <div>
                <strong>
                  {profile.removed
                    ? 'Private archive'
                    : profile.public
                      ? 'Public on the web'
                      : 'Visible within this universe'}
                </strong>
                <p>
                  {profile.removed
                    ? 'Your empire was removed. Your history remains available here; published cards keep their links.'
                    : 'Your selected moments are visible to players in this universe. Public profiles can also be read without an account.'}
                </p>
              </div>
              {!profile.removed && (
                <Button
                  variant="secondary"
                  disabled={busy || loading}
                  onClick={() =>
                    void save(profile, {
                      type: 'Visibility',
                      public: !profile.public,
                    })
                  }
                >
                  {profile.public
                    ? 'Turn off public profile'
                    : 'Make profile public'}
                </Button>
              )}
            </section>
          )}
          <div className={styles.tabs}>
            <Button
              variant={library ? 'ghost' : 'primary'}
              aria-pressed={!library}
              onClick={() => {
                setLibrary(false)
                setBefore(undefined)
              }}
            >
              Timeline
            </Button>
            {profile.owner && (
              <Button
                variant={library ? 'primary' : 'ghost'}
                aria-pressed={library}
                onClick={() => {
                  setLibrary(true)
                  setBefore(undefined)
                }}
              >
                Choose moments
              </Button>
            )}
            {loading && <span role="status">Refreshing…</span>}
          </div>
          {library && (
            <p className={styles.hint}>
              Your history is recorded automatically. Add the moments you want
              other players to see. A recommended battle is a memory, not an
              achievement.
            </p>
          )}
          <section
            className={styles.timeline}
            aria-label={library ? 'Available history' : 'Selected timeline'}
          >
            {profile.entries.length === 0 && (
              <div className={styles.empty}>
                <h2>
                  {library
                    ? 'History is still being written'
                    : 'A story waiting to be told'}
                </h2>
                <p>
                  {library
                    ? 'Recorded milestones will appear here as your empire grows.'
                    : profile.owner
                      ? 'Open Choose moments to add your first chapter.'
                      : 'This commander has not selected any moments yet.'}
                </p>
              </div>
            )}
            {profile.entries.map((entry) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                profile={profile}
                editing={library && profile.owner}
                busy={busy || loading}
                signedIn={!!session}
                save={save}
              />
            ))}
          </section>
          <div className={styles.actions}>
            {before && (
              <Button variant="secondary" onClick={() => setBefore(undefined)}>
                Newest moments
              </Button>
            )}
            {profile.next && (
              <Button
                variant="secondary"
                onClick={() => setBefore(profile.next ?? undefined)}
              >
                Older moments
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  )
}
