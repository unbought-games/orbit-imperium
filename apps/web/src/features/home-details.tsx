import { accountLinks } from './account-links'
import type { ReactNode } from 'react'
import {
  Atom,
  Factory,
  Flag,
  Infinity as InfinityIcon,
  Orbit,
  Radar,
  Trophy,
} from 'lucide-react'
import { ButtonLinkAnchor } from '../ui/button'
import { DiscordLink } from '../ui/discord-link'
import { HomeQuestions } from './home-questions'
import styles from './home-details.module.css'

import { GitHubLink } from '../ui/github-link'

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
  const fullWidth = mobile ? 390 : 1440
  return (
    <figure className={mobile ? styles.phone : styles.desktop}>
      <a
        href={`/art/landing/${name}-${fullWidth}.webp`}
        aria-label={`Open ${caption.toLowerCase()} screenshot at full size`}
      >
        <img
          src={`/art/landing/${name}-${width}.webp`}
          srcSet={
            mobile
              ? undefined
              : `/art/landing/${name}-960.webp 960w, /art/landing/${name}-1440.webp 1440w`
          }
          sizes={
            mobile
              ? '(max-width: 767px) 300px, (max-width: 1100px) 28vw, 290px'
              : '(max-width: 767px) calc(100vw - 40px), (max-width: 1300px) 92vw, 1200px'
          }
          width={width}
          height={mobile ? 844 : 600}
          loading="lazy"
          decoding="async"
          alt={alt}
        />
      </a>
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
      <section id="universes" aria-labelledby="universes-title">
        <div className={styles.universeIntro}>
          <div>
            <p className={styles.eyebrow}>
              Seasonal Universes · Official servers
            </p>
            <h2 id="universes-title">An ending worth playing for.</h2>
          </div>
          <div>
            <p>
              Build an empire, find your allies, and give it something to fight
              for. Our official servers run <strong>Seasonal Universes</strong>:
              develop your planets, compete with other empires, and earn a place
              in Orbit’s history.
            </p>
          </div>
        </div>
        <div className={styles.campaign}>
          <article>
            <div className={styles.campaignIcon} aria-hidden="true">
              <Orbit size={44} strokeWidth={1.4} />
            </div>
            <p className={styles.eyebrow}>Build</p>
            <h3>Build through the season</h3>
            <p>
              Develop your planets, form alliances, and make your moves over the
              course of the season. Each new universe brings a
              <strong> fresh start</strong> and another chance to compete.
            </p>
          </article>
          <article>
            <div className={styles.campaignIcon} aria-hidden="true">
              <Flag size={44} strokeWidth={1.4} />
            </div>
            <p className={styles.eyebrow}>Rally</p>
            <h3>One final campaign</h3>
            <p>
              Depending on the universe, alliances will compete for victory or
              everyone will work toward a shared goal. We’re designing
              objectives that give smaller empires a meaningful part in the
              outcome, too.
            </p>
          </article>
          <article>
            <div className={styles.campaignIcon} aria-hidden="true">
              <Trophy size={44} strokeWidth={1.4} />
            </div>
            <p className={styles.eyebrow}>Be remembered</p>
            <h3>A permanent legacy</h3>
            <p>
              A season ends. Your achievements stay with you. Earn
              <strong> permanent rewards and recognition</strong> in your
              Unbought Games account, and carry them into your next universe.
            </p>
          </article>
        </div>
        <div className={styles.eternal}>
          <div>
            <InfinityIcon
              className={styles.eternalIcon}
              size={56}
              strokeWidth={1.3}
              aria-hidden="true"
            />
            <p className={styles.eyebrow}>A longer horizon</p>
            <h3>Eternal Universes are coming.</h3>
            <p>
              We will have universes with no planned ending. First, we need
              enough players to give one a strong start. We’re not there yet,
              and we don’t have a launch date.
            </p>
          </div>
          <div>
            <p>
              Opening one now would give a handful of early players a long head
              start. We want the first Eternal Universe to feel like the moment
              a gate opens to an uncharted galaxy: new worlds within reach,
              fleets setting out, and a community crossing the threshold
              together.
            </p>
            <p>Get the first Eternal Universe launch news on Discord.</p>
            <div className={styles.eternalAction}>
              <DiscordLink className={styles.eternalDiscord} />
            </div>
            <p className={styles.developmentNote}>
              In the meantime,{' '}
              <a
                href={signupEnabled ? accountLinks.signup : accountLinks.login}
              >
                come play in the current universe
              </a>
              .
            </p>
          </div>
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
        <div className={styles.gameplayShowcase}>
          <Screenshot
            name="empire-desktop"
            alt="Orbit Imperium’s current desktop interface with its navigation sidebar, Empire wealth, transport fleet and active research."
            caption="Empire overview · Desktop"
          />
          <div className={styles.strategy}>
            <article>
              <Factory
                className={styles.strategyIcon}
                size={28}
                strokeWidth={1.4}
                aria-hidden="true"
              />
              <div>
                <h3>Develop your economy</h3>
                <p>
                  Build mines, balance energy, and turn metal, crystal, and
                  deuterium into your next upgrade. Expand to new planets as
                  your empire grows.
                </p>
              </div>
            </article>
            <article>
              <Atom
                className={styles.strategyIcon}
                size={28}
                strokeWidth={1.4}
                aria-hidden="true"
              />
              <div>
                <h3>Choose your research</h3>
                <p>
                  Unlock ships and capabilities. Invest in the technology your
                  plans need, while your planets keep producing.
                </p>
              </div>
            </article>
            <article>
              <Radar
                className={styles.strategyIcon}
                size={28}
                strokeWidth={1.4}
                aria-hidden="true"
              />
              <div>
                <h3>Commit your fleets</h3>
                <p>
                  Scout with probes, move supplies, and raid rival planets. Plan
                  your timing and defenses: the universe keeps running when
                  you’re offline.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

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
        </div>
        <div className={styles.phones}>
          <Screenshot
            name="empire-mobile"
            mobile
            alt="Orbit Imperium’s mobile Empire screen showing resource totals, a transport fleet and active research above the navigation."
            caption="Empire overview · Mobile"
          />
          <Screenshot
            name="research-mobile"
            mobile
            alt="Orbit Imperium’s current mobile Research screen with an active Energy Technology upgrade and drive research."
            caption="Research · Mobile"
          />
        </div>
      </section>

      <section className={styles.fairPlay} aria-labelledby="fair-play-title">
        <div>
          <p className={styles.eyebrow}>By Unbought Games</p>
          <h2 id="fair-play-title">Fair play</h2>
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
          <GitHubLink />
        </div>
      </section>

      <HomeQuestions />

      <section className={styles.join} aria-labelledby="join-title">
        <div>
          <p className={styles.eyebrow}>Join the universe</p>
          <h2 id="join-title">Start with your first planet.</h2>
          <p>
            Build your economy, send your first fleet, and find your place in
            the universe. Play free in your browser, on your own or alongside an
            alliance.
          </p>
          <div className={styles.joinAction}>
            <ButtonLinkAnchor
              href={signupEnabled ? accountLinks.signup : accountLinks.login}
            >
              {signupEnabled ? 'Play free' : 'Return to your account'}
              <span aria-hidden="true">→</span>
            </ButtonLinkAnchor>
          </div>
        </div>
        <div>{children}</div>
      </section>
    </div>
  )
}
