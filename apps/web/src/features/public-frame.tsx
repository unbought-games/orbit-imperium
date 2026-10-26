import type { ReactNode } from 'react'
import { EndorsedBrand } from '../ui/endorsed-brand'
import { atmosphereArt, resolvePlanetArt } from '../ui/artwork'
import styles from './public-frame.module.css'
import { BetaNotice } from '../ui/beta-notice'
import { PolicyLinks } from '../ui/policy-links'

const publicWorld = resolvePlanetArt(4)

/** Public illustration only: it never depicts a signed-in player's world. */
export function PublicFrame({
  children,
  variant = 'auth',
  afterHero,
  headerActions,
  nativeLinks = false,
}: {
  children: ReactNode
  variant?: 'landing' | 'auth' | 'recovery'
  afterHero?: ReactNode
  headerActions?: ReactNode
  nativeLinks?: boolean
}) {
  return (
    <main
      id="main"
      tabIndex={-1}
      className={`${styles.frame} ${styles[variant]}`}
    >
      <header className={styles.header}>
        <EndorsedBrand
          homeLink={variant !== 'recovery'}
          nativeLinks={nativeLinks}
        />
        {headerActions}
      </header>
      <div className={styles.composition}>
        {variant === 'landing' ? (
          <div className={styles.capital} aria-hidden="true">
            <img
              src="/art/orbital-capital/orbital-capital-1200.webp"
              srcSet="/art/orbital-capital/orbital-capital-768.webp 768w, /art/orbital-capital/orbital-capital-1200.webp 1200w, /art/orbital-capital/orbital-capital-1672.webp 1672w"
              sizes="(max-width: 767px) 600px, (max-width: 1400px) 1500px, 100vw"
              width={1672}
              height={941}
              alt=""
              fetchPriority="high"
              decoding="async"
              onError={({ currentTarget }) => {
                currentTarget.hidden = true
              }}
            />
          </div>
        ) : (
          <div className={styles.world} aria-hidden="true">
            <img
              className={styles.atmosphere}
              src={atmosphereArt.src}
              srcSet={atmosphereArt.srcSet}
              sizes="(max-width: 767px) 390px, 800px"
              width={atmosphereArt.width}
              height={atmosphereArt.height}
              alt=""
              decoding="async"
              onError={({ currentTarget }) => {
                currentTarget.hidden = true
              }}
            />
            <img
              className={styles.planet}
              src={publicWorld.src}
              srcSet={publicWorld.srcSet}
              sizes="(max-width: 767px) 290px, (max-width: 1700px) 48vw, 800px"
              width={publicWorld.width}
              height={publicWorld.height}
              alt=""
              decoding="async"
              onError={({ currentTarget }) => {
                currentTarget.hidden = true
              }}
              fetchPriority="high"
            />
            <svg className={styles.orbits} viewBox="0 0 700 700" fill="none">
              <circle cx="350" cy="350" r="293" />
              <circle cx="350" cy="350" r="312" strokeDasharray="1 9" />
              <ellipse
                cx="350"
                cy="350"
                rx="340"
                ry="106"
                transform="rotate(-24 350 350)"
              />
              <path d="M350 18v42m0 580v42M18 350h42m580 0h42" />
            </svg>
            <span className={styles.worldCaption}>A larger horizon.</span>
          </div>
        )}
        <section className={styles.content}>
          {variant !== 'landing' && <BetaNotice />}
          {children}
        </section>
      </div>
      {afterHero}
      <footer className={styles.footer}>
        <span>Deep games. Clear decisions. Fair competition.</span>
        <PolicyLinks />
        <div className={styles.footerDetails}>
          <span className={styles.footerNote}>An independent universe</span>
          {variant !== 'landing' && (
            <a href="/updates/index.html">What’s New</a>
          )}
        </div>
      </footer>
    </main>
  )
}
