import { InvitationLinks } from '../rewards/invitations'
import { useGameSession } from '../../shell/session-context'
import { useState } from 'react'
import { can, type AllianceDetail } from '../../client-model/alliances'
import {
  emptyRecruitment,
  recruitmentFromForm,
} from '../../client-model/recruitment'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { Field, Input, Select } from '../../ui/form'
import { value, type Run } from './shared'
import { SettingsForm, SettingsSection } from './settings-section'
import { RecruitmentFields } from './recruitment-fields'
import styles from './settings.module.css'

type Props = { detail: AllianceDetail; run: Run; busy: boolean }

export function RecruitmentSettings({ detail, run, busy }: Props) {
  if (!can(detail, 'ManageRecruitment')) return null
  return (
    <>
      <SettingsForm
        draftKey={`joining:${detail.summary.id}`}
        label="Save joining rules"
        busy={busy}
        onSubmit={(data) =>
          run({
            type: 'Update',
            alliance: detail.summary.id,
            name: detail.summary.name,
            tag: detail.summary.tag,
            public_text: detail.public_text,
            recruitment: value(
              data,
              'recruitment',
            ) as AllianceDetail['summary']['recruitment'],
          })
        }
      >
        <SettingsSection
          title="Joining rules"
          description="Choose how new members join your alliance."
        >
          <Field>
            Recruitment
            <Select
              aria-label="Recruitment"
              name="recruitment"
              defaultValue={detail.summary.recruitment}
            >
              <option value="Open">Open — instant joining</option>
              <option value="Application">
                Application — approval required
              </option>
              <option value="Closed">Closed — no new applications</option>
            </Select>
          </Field>
        </SettingsSection>
      </SettingsForm>
      <SettingsForm
        draftKey={`recruitment:${detail.summary.id}`}
        label="Save recruitment preferences"
        busy={busy}
        onSubmit={(data) =>
          run({
            type: 'SetRecruitmentProfile',
            alliance: detail.summary.id,
            profile: recruitmentFromForm(data),
          })
        }
      >
        <SettingsSection
          title="Discovery & preferences"
          description="Help players find an alliance that fits them."
        >
          <RecruitmentFields
            compact
            profile={detail.summary.recruitment_profile ?? emptyRecruitment}
          />
        </SettingsSection>
      </SettingsForm>
    </>
  )
}

export function InvitationSettings({ detail, run, busy }: Props) {
  const [message, setMessage] = useState('')
  const { view } = useGameSession()
  if (!can(detail, 'ManageRecruitment')) return null
  const path = detail.invitation
    ? `/invite/${detail.summary.universe}/${detail.invitation}`
    : null
  const url = path ? `${location.origin}${path}` : ''
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setMessage('Invitation link copied.')
    } catch {
      setMessage('Select and copy the invitation link.')
    }
  }
  return (
    <>
      <InvitationLinks
        publicEnabled={!!detail.invitation}
        entryPath={
          path ?? `/alliances/${detail.summary.universe}/${detail.summary.id}`
        }
        alliance={{
          universe_id: view.binding.universe,
          epoch_id: view.binding.epoch,
          alliance_id: detail.summary.id,
        }}
      />
      <SettingsSection
        title="Invitation link"
        description="A shareable link with no expiry. Your joining rules still apply."
      >
        {path ? (
          <>
            <Field>
              Invitation link
              <Input
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
              />
            </Field>
            <div className={styles.actions}>
              <Button size="small" onClick={() => void copy()}>
                Copy invitation link
              </Button>
              <ButtonLinkAnchor size="small" variant="secondary" href={path}>
                Preview invitation
              </ButtonLinkAnchor>
            </div>
          </>
        ) : (
          <div className={styles.actions}>
            <Button
              size="small"
              disabled={busy}
              onClick={() =>
                void run({
                  type: 'SetInvitation',
                  alliance: detail.summary.id,
                  enabled: true,
                })
              }
            >
              Create invitation link
            </Button>
          </div>
        )}
        {message && (
          <p className={styles.hint} role="status">
            {message}
          </p>
        )}
      </SettingsSection>
      {path && (
        <>
          <SettingsSection
            title="Recruitment image"
            description="An image of your alliance to share alongside the link."
          >
            <div className={styles.actions}>
              <ButtonLinkAnchor
                size="small"
                variant="secondary"
                href={`${path}/image`}
                download={`${detail.summary.tag}-recruitment.png`}
              >
                Download recruitment image
              </ButtonLinkAnchor>
            </div>
          </SettingsSection>
          <SettingsSection
            title="Link controls"
            description="Replace a shared link or turn it off. Your public recruitment page stays available."
          >
            <div className={styles.actions}>
              <ConfirmationButton
                size="small"
                variant="secondary"
                disabled={busy}
                dialogTitle="Replace invitation link?"
                cancelLabel="Keep link"
                confirmLabel="Replace link"
                review={
                  <p>
                    Previously shared invitation links will stop working. A new
                    link will be created.
                  </p>
                }
                onConfirm={() => {
                  setMessage('')
                  void run({
                    type: 'SetInvitation',
                    alliance: detail.summary.id,
                    enabled: true,
                  })
                }}
              >
                Replace invitation link
              </ConfirmationButton>
              <ConfirmationButton
                size="small"
                variant="secondary"
                disabled={busy}
                dialogTitle="Disable invitation link?"
                cancelLabel="Keep link"
                confirmLabel="Disable link"
                review={
                  <p>
                    This invitation link will stop working. Your public page and
                    recruitment rules remain available.
                  </p>
                }
                onConfirm={() => {
                  setMessage('')
                  void run({
                    type: 'SetInvitation',
                    alliance: detail.summary.id,
                    enabled: false,
                  })
                }}
              >
                Disable invitation link
              </ConfirmationButton>
            </div>
          </SettingsSection>
        </>
      )}
    </>
  )
}
