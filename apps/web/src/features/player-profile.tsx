import type { ReactNode, Ref } from 'react'
import type { PlayerDisplay } from '../adapters/player-profiles'
import { Popover } from '../ui/popover'
import { EmpireInsignia } from './empire-insignia'
import { AllianceTag, type AllianceIdentity } from './player-alliance'
import { SupporterIdentity } from './supporter-identity'
import { MessagePlayerLink } from './social/message-player-link'
import styles from './player-profile.module.css'

/** Only public identity belongs here. Planet activity stays with its planet. */
export function PlayerProfile({
  player,
  name,
  profile,
  alliance,
  bot,
  historical,
  children,
  triggerRef,
}: {
  player: string
  name: string
  profile?: PlayerDisplay
  alliance?: AllianceIdentity | null
  bot: boolean
  historical: boolean
  triggerRef?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <Popover
      label={`${name} profile`}
      trigger={children}
      triggerRef={triggerRef}
      className={styles.trigger}
      surfaceClassName={styles.profile}
      showTitle={false}
    >
      <div className={styles.heading}>
        <span className={styles.eyebrow}>EMPIRE DOSSIER</span>
        <span className={styles.kind}>
          {bot ? 'Automated player' : 'Commander'}
        </span>
      </div>
      <div className={styles.identity}>
        {profile?.insignia && (
          <EmpireInsignia appearance={profile.insignia} size="medium" />
        )}
        <div>
          <h3>
            <SupporterIdentity name={name} tier={profile?.supporter_tier} />
          </h3>
          <span className={styles.subtitle}>
            {bot
              ? 'An automated empire in this universe.'
              : 'An empire among the stars.'}
          </span>
        </div>
      </div>
      {alliance ? (
        <div className={styles.affiliation}>
          <span className={styles.eyebrow}>
            {historical ? 'RECORDED ALLIANCE' : 'ALLIANCE'}
          </span>
          <div>
            <AllianceTag alliance={alliance} /> <span>{alliance.name}</span>
          </div>
        </div>
      ) : (
        <p className={styles.subtitle}>
          {historical
            ? 'No alliance recorded.'
            : profile
              ? 'Independent empire'
              : 'Public profile unavailable.'}
        </p>
      )}
      {profile?.supporter_tier && (
        <p className={styles.subtitle}>
          Supports Orbit Imperium. Supporter status does not affect gameplay
          strength or protection.
        </p>
      )}
      <div className={styles.actions}>
        <MessagePlayerLink player={player} name={name} />
      </div>
    </Popover>
  )
}
