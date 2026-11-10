import { useState } from 'react'
import type { AllianceDetail } from '../../client-model/alliances'
import { Field, Select } from '../../ui/form'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { SettingsSection } from './settings-section'
import type { Run } from './shared'
import styles from './settings.module.css'

export function MembershipSettings({
  detail,
  player,
  run,
  busy,
}: {
  detail: AllianceDetail
  player: string
  run: Run
  busy: boolean
}) {
  const [selected, setSelected] = useState('')
  const members = (detail.members ?? [])
    .filter((member) => member.player !== player)
    .sort((a, b) => a.username.localeCompare(b.username))
  const successor = members.find((member) => member.player === selected)
  const leader = detail.leader === player
  return (
    <>
      {leader ? (
        <>
          <SettingsSection
            title="Transfer leadership"
            description="Choose a member to take command. You’ll remain in the alliance as a Member."
          >
            {members.length ? (
              <>
                <Field>
                  New leader
                  <Select
                    aria-label="New leader"
                    value={successor?.player ?? ''}
                    onChange={(event) => setSelected(event.target.value)}
                    disabled={busy}
                  >
                    <option value="">Choose a member</option>
                    {members.map((member) => (
                      <option key={member.player} value={member.player}>
                        {member.username}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className={styles.actions}>
                  <ConfirmationButton
                    variant="secondary"
                    size="small"
                    disabled={busy || !successor}
                    dialogTitle="Transfer leadership?"
                    cancelLabel="Cancel"
                    confirmLabel="Transfer leadership"
                    review={
                      <p>
                        Make {successor?.username} leader of{' '}
                        {detail.summary.name}? They gain full authority
                        immediately and you become a Member.
                      </p>
                    }
                    onConfirm={() => {
                      if (successor)
                        void run({
                          type: 'Transfer',
                          alliance: detail.summary.id,
                          player: successor.player,
                        })
                    }}
                  >
                    Transfer leadership
                  </ConfirmationButton>
                </div>
              </>
            ) : (
              <p className={styles.hint}>
                Another member must join before you can transfer leadership.
              </p>
            )}
          </SettingsSection>
          <SettingsSection
            title="Disband alliance"
            description="Permanently remove the alliance, its noticeboard, and pending applications."
          >
            <div className={styles.actions}>
              <ConfirmationButton
                variant="destructive"
                size="small"
                disabled={busy}
                dialogTitle="Disband alliance?"
                cancelLabel="Keep alliance"
                confirmLabel="Disband alliance"
                review={
                  <p>
                    Permanently disband {detail.summary.name} [
                    {detail.summary.tag}], remove all memberships, and delete
                    its private board and pending applications? This cannot be
                    undone.
                  </p>
                }
                onConfirm={() =>
                  void run({ type: 'Disband', alliance: detail.summary.id })
                }
              >
                Disband alliance
              </ConfirmationButton>
            </div>
          </SettingsSection>
        </>
      ) : (
        <SettingsSection
          title="Leave alliance"
          description="Leave this alliance and give up access to its private board and roster."
        >
          <div className={styles.actions}>
            <ConfirmationButton
              variant="destructive"
              size="small"
              disabled={busy}
              dialogTitle="Leave alliance?"
              cancelLabel="Stay in alliance"
              confirmLabel="Leave alliance"
              review={
                <p>
                  Leave {detail.summary.name}? You immediately lose access to
                  the private board and roster.
                </p>
              }
              onConfirm={() =>
                void run({ type: 'Leave', alliance: detail.summary.id })
              }
            >
              Leave alliance
            </ConfirmationButton>
          </div>
        </SettingsSection>
      )}
    </>
  )
}
