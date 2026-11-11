import { RecognitionMark } from './rewards/recognition'
import { usePlayerIdentity } from '../shell/player-profiles-context'
import { useIdentityTitle } from '../client-model/use-identity-title'
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
  triggerRef?: Ref<HTMLElement>
  children: ReactNode
}) {
  const retained = usePlayerIdentity(player)
  const identity = profile?.identity ?? retained?.identity
  const title = useIdentityTitle(profile?.title ?? retained?.title)
  return (
    <Popover
      label={`${name} profile`}
      trigger={children}
      link={
        /^[0-9a-f-]{36}$/i.test(player) ? (
          <a
            href={`/profiles/empire/${player}`}
            aria-label={`${name} profile details`}
          />
        ) : undefined
      }
      triggerRef={triggerRef}
      className={styles.trigger}
      surfaceClassName={styles.profile}
      showTitle={false}
    >
      <div className={styles.heading}>
        <span className={styles.eyebrow}>EMPIRE DOSSIER</span>
        <span className={styles.kind}>
          {bot ? 'Automated player' : title.label}
        </span>
      </div>
      <div className={styles.identity}>
        {profile?.insignia && (
          <EmpireInsignia appearance={profile.insignia} size="medium" />
        )}
        <div>
          <h3>
            {identity?.name || (
              <SupporterIdentity name={name} tier={profile?.supporter_tier} />
            )}
          </h3>
          {identity?.name && (
            <div>
              <SupporterIdentity name={name} tier={profile?.supporter_tier} />
            </div>
          )}
          <span className={styles.subtitle}>
            {bot
              ? 'An automated empire in this universe.'
              : identity?.tagline || 'An empire among the stars.'}
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
      {!historical && profile?.marks?.length ? (
        <div aria-label="Contribution honors">
          {profile.marks.map((mark) => (
            <RecognitionMark key={mark.id} mark={mark} />
          ))}
        </div>
      ) : null}
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
