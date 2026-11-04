import { useState } from 'react'
import { can, type AllianceDetail } from '../../client-model/alliances'
import {
  emptyRecruitment,
  recruitmentFromForm,
} from '../../client-model/recruitment'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import { ActionForm, ConfirmAction, type Run } from './shared'
import { RecruitmentFields } from './recruitment-fields'
import { RecruitmentImage } from './recruitment-image'
import styles from './alliances.module.css'
export function RecruitmentSettings({
  detail,
  run,
  busy,
}: {
  detail: AllianceDetail
  run: Run
  busy: boolean
}) {
  const [message, setMessage] = useState('')
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
      setMessage('Select and copy the invitation link above.')
    }
  }
  return (
    <section className={styles.stack} aria-label="Recruitment settings">
      <h3>Recruitment and invitations</h3>
      <ActionForm
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
        <RecruitmentFields
          profile={detail.summary.recruitment_profile ?? emptyRecruitment}
        />
      </ActionForm>
      <section
        className={`${styles.card} ${styles.stack}`}
        aria-label="Alliance invitation"
      >
        <h4>Invite people to your alliance</h4>
        <p>
          Share this link anywhere. It belongs to your alliance, has no expiry,
          and follows your current joining rules.
        </p>
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
              <Button onClick={() => void copy()}>Copy invitation link</Button>
              <ButtonLinkAnchor variant="secondary" href={path}>
                Preview invitation
              </ButtonLinkAnchor>
            </div>
            <RecruitmentImage
              path={path}
              name={detail.summary.name}
              tag={detail.summary.tag}
            />
            <ConfirmAction
              label="Replace invitation link"
              description="Replace this link? Previously shared invitation links will stop working."
              disabled={busy}
              onConfirm={() =>
                run({
                  type: 'SetInvitation',
                  alliance: detail.summary.id,
                  enabled: true,
                })
              }
            />
            <ConfirmAction
              label="Disable invitation link"
              description="Disable this invitation? Your public page and recruitment rules remain available."
              disabled={busy}
              onConfirm={() =>
                run({
                  type: 'SetInvitation',
                  alliance: detail.summary.id,
                  enabled: false,
                })
              }
            />
          </>
        ) : (
          <Button
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
        )}
        {message && <p role="status">{message}</p>}
      </section>
    </section>
  )
}
