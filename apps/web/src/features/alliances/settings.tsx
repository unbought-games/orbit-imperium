import { can, type AllianceDetail } from '../../client-model/alliances'
import { Field, Input } from '../../ui/form'
import { value, type Run } from './shared'
import { SettingsForm, SettingsSection } from './settings-section'
import { RecruitmentSettings, InvitationSettings } from './recruitment-settings'
import { MembershipSettings } from './membership-settings'
import styles from './settings.module.css'

export type SettingsDestination =
  | 'Profile'
  | 'Recruitment'
  | 'Invitations'
  | 'Leadership'
  | 'Membership'
export function Settings({
  detail,
  player,
  run,
  busy,
  section,
  onSectionChange,
}: {
  detail: AllianceDetail
  player: string
  run: Run
  busy: boolean
  section: SettingsDestination
  onSectionChange: (section: SettingsDestination) => void
}) {
  const sections: SettingsDestination[] = [
    ...(can(detail, 'EditProfile') ? ['Profile' as const] : []),
    ...(can(detail, 'ManageRecruitment')
      ? ['Recruitment' as const, 'Invitations' as const]
      : []),
    detail.leader === player ? 'Leadership' : 'Membership',
  ]
  const active = sections.includes(section) ? section : sections[0]
  return (
    <section className={styles.layout} aria-label="Alliance settings">
      <nav className={styles.navigation} aria-label="Settings sections">
        {sections.map((name) => (
          <button
            key={name}
            type="button"
            aria-current={active === name ? 'page' : undefined}
            onClick={() => onSectionChange(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className={styles.content}>
        {active === 'Profile' && (
          <SettingsForm
            draftKey={`profile:${detail.summary.id}`}
            label="Save profile"
            busy={busy}
            onSubmit={(data) =>
              run({
                type: 'Update',
                alliance: detail.summary.id,
                name: value(data, 'name'),
                tag: value(data, 'tag'),
                public_text: value(data, 'public_text'),
                recruitment: detail.summary.recruitment,
              })
            }
          >
            <SettingsSection
              title="Alliance identity"
              description="The name and tag players see across the universe."
            >
              <div className={styles.identity}>
                <Field>
                  Alliance name
                  <Input
                    name="name"
                    required
                    minLength={3}
                    maxLength={48}
                    defaultValue={detail.summary.name}
                  />
                </Field>
                <Field>
                  Alliance tag
                  <Input
                    name="tag"
                    required
                    minLength={3}
                    maxLength={8}
                    pattern="[A-Za-z0-9]{3,8}"
                    defaultValue={detail.summary.tag}
                  />
                </Field>
              </div>
            </SettingsSection>
            <SettingsSection
              title="Public introduction"
              description="Tell prospective allies what your alliance is about."
            >
              <Field>
                Public recruitment text
                <textarea
                  className={styles.textarea}
                  name="public_text"
                  rows={5}
                  maxLength={8000}
                  defaultValue={detail.public_text}
                />
              </Field>
              <p className={styles.hint}>Basic Markdown supported</p>
            </SettingsSection>
          </SettingsForm>
        )}
        {active === 'Recruitment' && (
          <RecruitmentSettings detail={detail} run={run} busy={busy} />
        )}
        {active === 'Invitations' && (
          <InvitationSettings detail={detail} run={run} busy={busy} />
        )}
        {(active === 'Leadership' || active === 'Membership') && (
          <MembershipSettings
            detail={detail}
            player={player}
            run={run}
            busy={busy}
          />
        )}
      </div>
    </section>
  )
}
