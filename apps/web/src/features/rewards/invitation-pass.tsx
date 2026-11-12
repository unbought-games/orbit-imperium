import { useId, type ReactNode } from 'react'
import { atmosphereArt, resolvePlanetArt, type Artwork } from '../../ui/artwork'
import { EndorsedBrand } from '../../ui/endorsed-brand'
import { LoadingRegion } from '../../ui/loading-region'
import { PolicyLinks } from '../../ui/policy-links'
import styles from './invitation-pass.module.css'

export type InvitationPassProps = {
  sender?: { name: string; empire?: string | null; title?: string | null }
  /** Render the existing PlayerName here; its inline identity behavior is retained. */
  senderIdentity?: ReactNode
  /** Existing EmpireInsignia, size="medium". No appearance rules live here. */
  emblem?: ReactNode
  universe?: {
    name: string
    summary?: string
    facts?: readonly { label: string; value: string }[]
    /** Approved game art selected by the caller; never a source of game facts. */
    artwork?: Artwork
  }
  universePreview?: ReactNode
  /** Caller owns the authenticated route, destination validity and disabled state. */
  primaryAction: ReactNode
  secondaryAction?: ReactNode
  loading?: boolean
  notice?: ReactNode
  unavailable?: boolean
}

const invitationWorld = resolvePlanetArt(4)

/** Presentation only: identity, destination and entry authority stay with the caller. */
export function InvitationPass({
  sender,
  senderIdentity,
  emblem,
  universe,
  universePreview,
  primaryAction,
  secondaryAction,
  loading = false,
  notice,
  unavailable = false,
}: InvitationPassProps) {
  const id = useId()
  const world = universe?.artwork ?? invitationWorld
  return (
    <main id="main" tabIndex={-1} className={styles.pass}>
      <section className={styles.hero} aria-labelledby={`${id}-title`}>
        <div className={styles.atmosphere} aria-hidden="true">
          <img
            src={atmosphereArt.src}
            srcSet={atmosphereArt.srcSet}
            sizes="100vw"
            width={atmosphereArt.width}
            height={atmosphereArt.height}
            alt=""
          />
        </div>
        <header className={styles.header}>
          <EndorsedBrand nativeLinks />
          <p className={styles.headerNote}>
            A shared universe. A story of your own.
          </p>
        </header>

        <div className={styles.composition}>
          <div className={styles.copy}>
            <LoadingRegion
              loading={loading}
              label="Loading your invitation"
              className={styles.details}
            >
              <div className={styles.sender}>
                {emblem && <div className={styles.seal}>{emblem}</div>}
                <div className={styles.senderCopy}>
                  <p className={styles.eyebrow}>
                    {sender
                      ? 'A personal invitation from'
                      : 'Your invitation to Orbit Imperium'}
                  </p>
                  {sender && (
                    <>
                      <p className={styles.senderName}>
                        {senderIdentity ?? sender.name}
                      </p>
                      {(sender.title || sender.empire) && (
                        <p className={styles.senderDetails}>
                          {sender.title}
                          {sender.title && sender.empire && (
                            <span aria-hidden="true"> · </span>
                          )}
                          {sender.empire}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              <h1 id={`${id}-title`} className={styles.title}>
                {unavailable ? (
                  'A new horizon awaits.'
                ) : (
                  <>
                    Your place
                    <br />
                    among the stars.
                  </>
                )}
              </h1>
              <p className={styles.introduction}>
                {unavailable
                  ? 'This invitation’s destination is unavailable. There are still worlds to discover.'
                  : 'A world to build. Allies to find. An empire with your name on it.'}
              </p>
            </LoadingRegion>

            <div className={styles.destination}>
              <p className={styles.eyebrow}>Your destination</p>
              <h2 className={styles.universeName}>
                {universe?.name ??
                  (loading ? 'Finding your universe…' : 'A new horizon')}
              </h2>
              {universe?.summary && (
                <p className={styles.universeSummary}>{universe.summary}</p>
              )}
              {!!universe?.facts?.length && (
                <dl className={styles.facts}>
                  {universe.facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>

            <div className={styles.entry}>
              {notice && <div className={styles.notice}>{notice}</div>}
              <div className={styles.primaryAction}>{primaryAction}</div>
              <p className={styles.promise}>
                Free in your browser. No purchased advantage.
              </p>
              {secondaryAction && (
                <div className={styles.secondaryAction}>{secondaryAction}</div>
              )}
            </div>
          </div>

          <div className={styles.visual}>
            {universePreview ?? (
              <div className={styles.world} aria-hidden="true">
                <div className={styles.orbit} />
                <img
                  src={world.src}
                  srcSet={world.srcSet}
                  sizes="(max-width: 760px) 360px, 58vw"
                  width={world.width}
                  height={world.height}
                  alt=""
                  fetchPriority="high"
                  decoding="async"
                  onError={({ currentTarget }) => {
                    currentTarget.hidden = true
                  }}
                />
              </div>
            )}
          </div>
        </div>

        <a className={styles.discover} href={`#${id}-overview`}>
          Discover life in Orbit Imperium <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section
        className={styles.overview}
        id={`${id}-overview`}
        aria-labelledby={`${id}-overview-title`}
      >
        <div className={styles.overviewIntroduction}>
          <p className={styles.eyebrow}>
            From your first world to the far horizon
          </p>
          <h2 id={`${id}-overview-title`}>
            Start small.
            <br />
            Think in galaxies.
          </h2>
          <p>
            Orbit Imperium is a shared space strategy game. Your choices shape
            your empire, and the people around you help shape its story.
          </p>
        </div>
        <ol className={styles.chapters}>
          <li>
            <span className={styles.chapterNumber} aria-hidden="true">
              01
            </span>
            <div>
              <h3>Build your foothold.</h3>
              <p>
                Develop your planet’s economy. Research new technology. Turn a
                quiet colony into the heart of an empire.
              </p>
            </div>
          </li>
          <li>
            <span className={styles.chapterNumber} aria-hidden="true">
              02
            </span>
            <div>
              <h3>Reach beyond your horizon.</h3>
              <p>
                Build ships, explore the galaxy and command your fleets. Every
                expedition, raid and return journey asks you to think ahead.
              </p>
            </div>
          </li>
          <li>
            <span className={styles.chapterNumber} aria-hidden="true">
              03
            </span>
            <div>
              <h3>Find your people.</h3>
              <p>
                Join an alliance, share discoveries and face your rivals
                together. Strategy and cooperation decide what comes next.
              </p>
            </div>
          </li>
        </ol>
        <div className={styles.capital} aria-hidden="true">
          <img
            src="/art/orbital-capital/orbital-capital-1200.webp"
            srcSet="/art/orbital-capital/orbital-capital-768.webp 768w, /art/orbital-capital/orbital-capital-1200.webp 1200w, /art/orbital-capital/orbital-capital-1672.webp 1672w"
            sizes="100vw"
            width={1672}
            height={941}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <p className={styles.fairPlay}>
          An empire earned through play.
          <br />
          <span>Built by Unbought Games. Open source. Fair by design.</span>
        </p>
      </section>
      <footer className={styles.footer}>
        <span>Orbit Imperium · by Unbought Games</span>
        <PolicyLinks />
      </footer>
    </main>
  )
}
