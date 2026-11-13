import { SettingsBackLink } from '../shell/settings-back-link'
import { GalaxyProbeSettings } from './galaxy-probe-settings'
import { VacationSettings } from './vacation'
import { EmpireDeletion } from './empire-deletion'
import { InsigniaEditor } from './insignia-editor'
import { useGameScreen } from '../shell/screen-context'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { Button } from '../ui/button'
import { DiscordLink } from '../ui/discord-link'
import styles from './settings.module.css'
import { DestinationLayout, DestinationHeading } from '../ui/destination-layout'
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { PlayerName } from './player-name'
import type { ReactNode } from 'react'
import {
  settingsSections,
  type SettingsSection,
} from '../shell/settings-navigation-model'
import { SettingsIdentity } from './settings-identity'

export function SettingsScreen() {
  const { route } = useGameScreen()
  const selected = route.item as SettingsSection
  return (
    <DestinationLayout className={styles.screen}>
      <SettingsBackLink />
      <SettingsPane section="identity" selected={selected}>
        <SettingsIdentity />
        <InsigniaEditor appearance="plain" />
      </SettingsPane>
      <SettingsPane section="game" selected={selected}>
        <Text>Fine-tune how you play in this universe.</Text>
        <GalaxyProbeSettings />
        <VacationSettings />
        <Heading level={2}>Display & accessibility</Heading>
        <Text>
          Display follows your device’s text size. UI changes appear without
          animation.
        </Text>
      </SettingsPane>
      <SettingsPane section="support" selected={selected}>
        <Section aria-label="Community">
          <Heading level={2}>Community</Heading>
          <Text>
            Meet other players and keep up with Orbit Imperium on Discord.
          </Text>
          <DiscordLink />
        </Section>
        <Section aria-label="Help and conduct reports">
          <Heading level={2}>Help & conduct reports</Heading>
          <Text>
            Email{' '}
            <a
              className={styles.supportLink}
              href="mailto:support@unbought.games"
            >
              support@unbought.games
            </a>{' '}
            for help or to report a conduct concern. Support is best effort: we
            aim to respond within 24 hours, but response times are not
            guaranteed.
          </Text>
        </Section>
        <UniverseSettings />
      </SettingsPane>
      <SettingsPane section="session" selected={selected}>
        <SessionSettings />
      </SettingsPane>
      <SettingsPane section="deletion" selected={selected}>
        <EmpireDeletion heading={null} />
      </SettingsPane>
    </DestinationLayout>
  )
}

function SettingsPane({
  section,
  selected,
  children,
}: {
  section: SettingsSection
  selected: SettingsSection
  children: ReactNode
}) {
  if (section !== selected) return null
  return (
    <div id={section} className={styles.pane}>
      <DestinationHeading>
        {section === 'deletion' ? 'Delete empire' : settingsSections[section]}
      </DestinationHeading>
      {children}
    </div>
  )
}

function UniverseSettings() {
  const { view, model } = useGameScreen()
  const settings = model.settings
  return (
    <>
      <Heading level={2}>Universe settings</Heading>
      {settings ? (
        <Text aria-label="Universe settings">
          Universe speed: {settings.speed}×. {settings.galaxies} galaxy ·{' '}
          {settings.systems_per_galaxy} solar systems per galaxy ·{' '}
          {settings.positions_per_system} planet positions per system.
        </Text>
      ) : (
        <Text>Universe settings unavailable. Reconnect to try again.</Text>
      )}
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
    </>
  )
}

function SessionSettings() {
  const { view, universeName, logout } = useGameScreen()
  const identity = usePlayerDisplay(view.binding.player)
  return (
    <>
      <dl className={styles.identity}>
        {identity && (
          <div>
            <dt>Account</dt>
            <dd>
              <PlayerName player={view.binding.player} fallback="You" />
            </dd>
            {identity.supporter_tier && (
              <dd>
                <Text>
                  Supporter · Thank you for supporting Unbought Games.
                </Text>
              </dd>
            )}
          </div>
        )}
        <div>
          <dt>Membership</dt>
          <dd>{view.binding.player}</dd>
        </div>
        <div>
          <dt>Universe</dt>
          <dd>{universeName}</dd>
        </div>
      </dl>
      <section className={styles.session} aria-label="Session actions">
        <Heading level={2}>Current session</Heading>
        <Text>Sign out of this account on this device.</Text>
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </section>
    </>
  )
}
