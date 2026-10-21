import { useGameScreen } from '../shell/screen-context'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { Button } from '../ui/button'
import styles from './settings.module.css'
import { BetaNotice } from '../ui/beta-notice'
export function SettingsScreen() {
  const { view, model, logout } = useGameScreen()
  const settings = model.settings
  return (
    <Section className={styles.screen}>
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Account & universe</p>
        <Heading level={2} className={styles.title}>
          Your place in the universe.
        </Heading>
        <Text>Membership, universe rules and display preferences.</Text>
      </header>
      <BetaNotice />
      <Section aria-label="Help and conduct reports">
        <Heading level={2}>Help & conduct reports</Heading>
        <Text>
          Email <a href="mailto:ethan@unbought.games">ethan@unbought.games</a>{' '}
          for help or to report a conduct concern. Support is best effort: we
          aim to respond within 24 hours, but response times are not guaranteed.
        </Text>
      </Section>
      <Heading level={2}>Universe settings</Heading>
      {settings ? (
        <Text aria-label="Universe settings">
          Universe speed: {settings.speed}× — fixed for this universe.{' '}
          {settings.galaxies} galaxy · {settings.systems_per_galaxy} solar
          systems per galaxy · {settings.positions_per_system} planet positions
          per system.
        </Text>
      ) : (
        <Text>Universe settings unavailable. Reconnect to try again.</Text>
      )}
      <dl className={styles.identity}>
        <div>
          <dt>Membership</dt>
          <dd>{view.binding.player}</dd>
        </div>
        <div>
          <dt>Universe</dt>
          <dd>{view.binding.universe}</dd>
        </div>
      </dl>
      {view.capabilities.some(
        (c) => c.capability === 'Attack' && c.enabled,
      ) && (
        <Section aria-label="Player attack rules">
          <Heading level={2}>Attack conduct rule</Heading>
          <Text>
            At most six qualifying attack contacts per attacker and stable
            target body in a rolling 24 hours against active targets. Wins and
            draws count, including probe-only attacks. Total defeat, espionage,
            recalled fleets and missing-target failures do not. A target is
            active when their last foreground presence was less than seven days
            before contact.
          </Text>
          <Text>
            The window excludes a contact exactly 24 hours old. The seventh
            contact still resolves normally and retains private evidence. There
            is no automatic sanction or alliance-war exception.
          </Text>
        </Section>
      )}
      <Heading level={2}>Display & accessibility</Heading>
      <Text>
        Display follows your device’s text size and reduced-motion preferences.
      </Text>
      <section className={styles.session} aria-label="Session actions">
        <Heading level={2}>Current session</Heading>
        <Text>Sign out of this account on this device.</Text>
        <Button variant="quiet" onClick={() => void logout()}>
          Sign out
        </Button>
      </section>
    </Section>
  )
}
