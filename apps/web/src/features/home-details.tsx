import type { ReactNode } from 'react'
import { ButtonLink } from '../ui/button'
import styles from './home-details.module.css'

const repository = 'https://github.com/unbought-games/orbit-imperium'

function Screenshot({
  name,
  alt,
  caption,
  mobile = false,
}: {
  name: string
  alt: string
  caption: string
  mobile?: boolean
}) {
  const width = mobile ? 390 : 960
  return (
    <figure className={mobile ? styles.phone : styles.desktop}>
      <a
        href={`/art/landing/${name}-${width * 2}.webp`}
        aria-label={`Open ${caption.toLowerCase()} screenshot at full size`}
      >
        <img
          src={`/art/landing/${name}-${width}.webp`}
          srcSet={`/art/landing/${name}-${width}.webp ${width}w, /art/landing/${name}-${width * 2}.webp ${width * 2}w`}
          sizes={
            mobile
              ? '(max-width: 767px) 300px, (max-width: 1100px) 28vw, 290px'
              : '(max-width: 767px) calc(100vw - 40px), (max-width: 1300px) 92vw, 1200px'
          }
          width={width}
          height={mobile ? 844 : 855}
          loading="lazy"
          decoding="async"
          alt={alt}
        />
      </a>
      <figcaption>
        {caption} <span aria-hidden="true">↗</span>
      </figcaption>
    </figure>
  )
}

export function HomeDetails({
  signupEnabled,
  children,
}: {
  signupEnabled: boolean
  children: ReactNode
}) {
  return (
    <div className={styles.details}>
      <section
        id="mobile"
        className={styles.mobile}
        aria-labelledby="mobile-title"
      >
        <div className={styles.mobileCopy}>
          <p className={styles.eyebrow}>Desktop & mobile</p>
          <h2 id="mobile-title">Play on your phone.</h2>
          <p>
            Check your planets, choose your next research, and manage your
            fleets from your mobile browser. Pick up on your computer with the
            same account and the same universe.
          </p>
          <p>
            The game fits the screen you’re using. No separate mobile version,
            no app store, and no download required.
          </p>
          <a href="#gameplay" className={styles.textLink}>
            Explore the strategy <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className={styles.phones}>
          <Screenshot
            name="empire-mobile"
            mobile
            alt="Orbit’s mobile Empire screen with planet resources, construction and fleet activity above the bottom navigation."
            caption="Empire overview · Mobile"
          />
          <Screenshot
            name="research-mobile"
            mobile
            alt="Orbit’s mobile Research screen showing technology levels and an active Energy Technology upgrade."
            caption="Research · Mobile"
          />
        </div>
      </section>

      <section
        id="gameplay"
        className={styles.gameplay}
        aria-labelledby="gameplay-title"
      >
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Inside the universe</p>
          <h2 id="gameplay-title">Build planets. Plan your next move.</h2>
          <p>
            Start with a homeworld and decide where to invest. More production,
            new technology, another colony, or a fleet ready to leave orbit:
            every choice uses resources you could spend elsewhere.
          </p>
        </div>
        <Screenshot
          name="empire-desktop"
          alt="Orbit’s desktop Empire overview showing two planets, their resources, construction, research and a transport fleet."
          caption="Empire overview · Desktop"
        />
        <p className={styles.captureNote}>
          Actual game screens, shown with a demonstration universe. Select a
          screenshot to see it at full size.
        </p>
        <div className={styles.strategy}>
          <article>
            <span className={styles.number} aria-hidden="true">
              01
            </span>
            <h3>Develop your economy</h3>
            <p>
              Build mines, balance energy, and turn metal, crystal, and
              deuterium into your next upgrade. Expand to new planets as your
              empire grows.
            </p>
          </article>
          <article>
            <span className={styles.number} aria-hidden="true">
              02
            </span>
            <h3>Choose your research</h3>
            <p>
              Unlock ships and capabilities. Invest in the technology your plans
              need, while your planets keep producing.
            </p>
          </article>
          <article>
            <span className={styles.number} aria-hidden="true">
              03
            </span>
            <h3>Commit your fleets</h3>
            <p>
              Scout with probes, move supplies, and raid rival planets. Plan
              your timing and defenses: the universe keeps running when you’re
              offline.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.fairPlay} aria-labelledby="fair-play-title">
        <div>
          <p className={styles.eyebrow}>By unbought games</p>
          <h2 id="fair-play-title">Victory isn’t for sale.</h2>
          <p>
            You can’t buy resources, faster queues, or stronger fleets. Your
            progress comes from playing. That commitment is part of why we’re
            building Orbit Imperium.
          </p>
        </div>
        <div className={styles.openSource}>
          <h3>Built in the open</h3>
          <p>
            Orbit is open source. Read the code, follow development, contribute,
            or run an independent universe for your own community.
          </p>
          <a
            className={styles.textLink}
            href={`${repository}#run-your-own-universe`}
          >
            Explore the project <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className={styles.join} aria-labelledby="join-title">
        <div>
          <p className={styles.eyebrow}>Come play the open beta</p>
          <h2 id="join-title">Start with your first planet.</h2>
          <p>
            We’re a small community, and the game is still taking shape. Join a
            universe, build your economy, and see how far you can take it. If
            something feels wrong, we’d like to hear about it.
          </p>
          <div className={styles.joinAction}>
            <ButtonLink to={signupEnabled ? '/signup' : '/login'}>
              {signupEnabled ? 'Join the open beta' : 'Return to your account'}
              <span aria-hidden="true">→</span>
            </ButtonLink>
          </div>
          <p className={styles.betaNote}>
            This is an incomplete game. We may reset the universe and its
            progress before full public launch.
          </p>
        </div>
        <div className={styles.community}>{children}</div>
      </section>
    </div>
  )
}
