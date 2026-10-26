import { PublicFrame } from './public-frame'
import linkStyles from '../ui/link.module.css'
import { ButtonLinkAnchor } from '../ui/button'
import { BetaNotice } from '../ui/beta-notice'
import { Heading, Text, Eyebrow } from '../ui/typography'
import styles from './login.module.css'
import { HomeDetails } from './home-details'
import landingStyles from './home-details.module.css'

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
            <a
              href="/signup"
              className={`${linkStyles.link} ${landingStyles.headerSignup}`}
            >
              Sign up
            </a>
          )}
          <ButtonLinkAnchor href="/login" className={landingStyles.headerLogin}>
            Log in
          </ButtonLinkAnchor>
        </nav>
      }
      afterHero={
        <HomeDetails signupEnabled={signupEnabled}>
          <nav aria-label="News and community" className={styles.community}>
            <a className={styles.updates} href="/updates/index.html">
              What’s New <span aria-hidden="true">→</span>
            </a>
            <a
              className={styles.repository}
              href="https://github.com/unbought-games/orbit-imperium"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
              >
                <path d="M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.791-1.508-3.791-1.508-.512-1.3-1.25-1.646-1.25-1.646-1.023-.7.077-.686.077-.686 1.13.08 1.724 1.16 1.724 1.16 1.006 1.724 2.64 1.226 3.282.938.102-.73.394-1.226.716-1.508-2.498-.284-5.124-1.25-5.124-5.565 0-1.23.44-2.232 1.16-3.02-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.153A10.8 10.8 0 0 1 12 6.18c.956.004 1.918.13 2.817.378 2.148-1.456 3.092-1.153 3.092-1.153.615 1.55.228 2.695.112 2.98.722.788 1.158 1.79 1.158 3.02 0 4.327-2.63 5.278-5.136 5.557.404.35.764 1.042.764 2.1 0 1.516-.014 2.738-.014 3.11 0 .3.203.65.774.54A11.25 11.25 0 0 0 12 .75Z" />
              </svg>
              View on GitHub
            </a>
            <a className={styles.discord} href="https://discord.gg/AVMHp7jUcw">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="currentColor"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.445.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .031-.056c.501-5.177-.839-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.418 2.157-2.418 1.211 0 2.176 1.095 2.157 2.418 0 1.334-.946 2.419-2.157 2.419Z" />
              </svg>
              Join our Discord
            </a>
          </nav>
        </HomeDetails>
      }
    >
      <Eyebrow className={styles.eyebrow}>
        Persistent multiplayer space strategy
      </Eyebrow>
      <Heading
        level={1}
        className={`${styles.title} ${landingStyles.heroTitle}`}
      >
        Victory isn’t <br />
        for sale.
      </Heading>
      <Text className={styles.introduction}>
        Build an empire by developing your planets, researching technologies,
        and sending your fleets across the shared universe. Play in your browser
        across desktop and mobile.
      </Text>
      <div className={landingStyles.beta}>
        <BetaNotice />
      </div>
      <nav aria-label="Get started" className={styles.actions}>
        {signupEnabled && (
          <ButtonLinkAnchor className={styles.primary} href="/signup">
            Create an account
          </ButtonLinkAnchor>
        )}
        {signupEnabled ? (
          <a href="/login" className={linkStyles.link}>
            Sign in <span aria-hidden="true">→</span>
          </a>
        ) : (
          <ButtonLinkAnchor className={styles.primary} href="/login">
            Sign in
          </ButtonLinkAnchor>
        )}
      </nav>
    </PublicFrame>
  )
}
