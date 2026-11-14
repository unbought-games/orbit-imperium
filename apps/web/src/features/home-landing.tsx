import { accountLinks } from './account-links'
import type { MouseEvent } from 'react'
import { PublicFrame } from './public-frame'
import { ButtonLinkAnchor } from '../ui/button'
import { Heading, Text, Eyebrow } from '../ui/typography'
import styles from './login.module.css'
import { HomeDetails } from './home-details'
import { DiscordLink } from '../ui/discord-link'
import { GitHubLink } from '../ui/github-link'
import { CommunityLink } from '../ui/community-link'
import { ArrowDown, ArrowRight, Newspaper, Users } from 'lucide-react'
import landingStyles from './home-details.module.css'

function scrollToUniverses(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return
  const section = document.getElementById('universes')
  if (!section) return
  event.preventDefault()
  section.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth',
    block: 'start',
  })
  history.replaceState(history.state, '', '#universes')
}

export function HomeLanding({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <PublicFrame
      variant="landing"
      nativeLinks
      headerActions={
        <nav
          aria-label="Player account"
          className={landingStyles.accountActions}
        >
          {signupEnabled && (
            <ButtonLinkAnchor
              href={accountLinks.signup}
              className={landingStyles.headerSignup}
            >
              Sign up
            </ButtonLinkAnchor>
          )}
          <ButtonLinkAnchor
            href={accountLinks.login}
            variant="secondary"
            className={landingStyles.headerLogin}
          >
            Log in
          </ButtonLinkAnchor>
        </nav>
      }
      afterHero={
        <HomeDetails signupEnabled={signupEnabled}>
          <nav
            aria-label="News and community"
            className={landingStyles.communityNav}
          >
            <CommunityLink
              href="/updates/index.html"
              icon={<Newspaper size={24} strokeWidth={1.5} />}
              title="What’s new"
              description="Follow the latest game updates"
            />
            <CommunityLink
              href="/alliances"
              icon={<Users size={24} strokeWidth={1.5} />}
              title="Find an alliance"
              description="Meet the people you’ll play alongside"
            />
            <GitHubLink appearance="navigation" />
            <DiscordLink appearance="navigation" />
          </nav>
        </HomeDetails>
      }
    >
      <Eyebrow className={styles.eyebrow}>Multiplayer space strategy</Eyebrow>
      <Heading
        level={1}
        className={`${styles.title} ${landingStyles.heroTitle}`}
      >
        Victory isn’t <br />
        for sale.
      </Heading>
      <Text className={styles.introduction}>
        Orbit Imperium is a free multiplayer space strategy game. Develop your
        planets, research technologies, and send fleets across a shared
        universe. Play in your desktop or mobile browser.
      </Text>
      <nav aria-label="Get started" className={landingStyles.heroActions}>
        {signupEnabled && (
          <ButtonLinkAnchor
            className={styles.primary}
            href={accountLinks.signup}
          >
            Play free
          </ButtonLinkAnchor>
        )}
        {signupEnabled ? (
          <ButtonLinkAnchor
            href={accountLinks.login}
            variant="secondary"
            className={landingStyles.signIn}
          >
            Sign in <ArrowRight size={18} aria-hidden="true" />
          </ButtonLinkAnchor>
        ) : (
          <ButtonLinkAnchor
            className={styles.primary}
            href={accountLinks.login}
          >
            Sign in
          </ButtonLinkAnchor>
        )}
      </nav>
      <a
        href="#universes"
        className={landingStyles.universeLink}
        onClick={scrollToUniverses}
      >
        <span className={landingStyles.scrollOrbit} aria-hidden="true">
          <ArrowDown size={20} strokeWidth={1.5} />
        </span>
        <span>How our universes work</span>
      </a>
    </PublicFrame>
  )
}
