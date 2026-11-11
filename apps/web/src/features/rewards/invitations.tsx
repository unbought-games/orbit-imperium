import {
  rememberedInvitation,
  clearRememberedInvitation,
} from '../../client-model/community-invitation'
import { useState } from 'react'
import type { CommunityInvitationPreview } from '../../adapters/community-rewards'
import {
  useCommunityRewards,
  useOptionalCommunityRewards,
} from '../../shell/community-rewards-context'
import { Button } from '../../ui/button'
import { ConfirmationButton } from '../../ui/confirmation-button'
import { Field, Input } from '../../ui/form'
import styles from './rewards.module.css'
export function InvitationLinks({
  alliance,
  publicOnly = false,
  publicEnabled = true,
  entryPath,
}: {
  alliance?: { universe_id: string; epoch_id: string; alliance_id: string }
  publicOnly?: boolean
  publicEnabled?: boolean
  entryPath?: string
}) {
  const rewards = useOptionalCommunityRewards()
  const [copied, setCopied] = useState('')
  if (!rewards?.visible || !rewards.owner) return null
  const { owner, controller, busy } = rewards
  const kinds = alliance
    ? publicOnly
      ? ['alliance_public' as const]
      : ['combined' as const, 'alliance_public' as const]
    : ['personal' as const]
  return (
    <div className={styles.inviteLinks}>
      {kinds.map((kind) => {
        const invitations = owner.invitations.filter(
          (i) =>
            i.kind === kind &&
            (!alliance || i.alliance?.alliance_id === alliance.alliance_id),
        )
        const title =
          kind === 'personal'
            ? 'Personal invitation'
            : kind === 'combined'
              ? 'You and your alliance'
              : 'Alliance public invitation'
        return (
          <section key={kind}>
            <h3>{title}</h3>
            <p>
              {kind === 'personal'
                ? 'Personal credit only. Your alliance is not added.'
                : kind === 'combined'
                  ? 'Credit goes to you and this alliance. Recruitment permission is checked again when your friend accepts.'
                  : 'Alliance credit only. No member receives personal referral credit.'}
            </p>
            {kind === 'alliance_public' && !publicEnabled ? (
              <p>
                Enable the alliance’s public invitation link below before
                sharing alliance-only credit.
              </p>
            ) : invitations.length === 0 ? (
              <Button
                variant="secondary"
                disabled={busy || !owner.capabilities.invite}
                onClick={() =>
                  void controller.act({
                    type: 'create_invitation',
                    kind,
                    ...(alliance
                      ? { game_id: 'orbit-imperium', alliance }
                      : {}),
                  })
                }
              >
                Create {title.toLowerCase()}
              </Button>
            ) : (
              invitations.map((invitation) => {
                const link = entryPath
                  ? new URL(entryPath, location.origin)
                  : new URL(
                      `/invite/${encodeURIComponent(invitation.code)}`,
                      owner.capabilities.full_selection_url,
                    )
                if (entryPath)
                  link.searchParams.set('rewards_invitation', invitation.code)
                const url = link.href
                return (
                  <div className={styles.copyRow} key={invitation.code}>
                    <label>
                      Invite code
                      <input
                        readOnly
                        value={invitation.code}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(url)
                          .then(() => setCopied(invitation.code))
                          .catch(() => setCopied('Select and copy the code.'))
                      }
                    >
                      {copied === invitation.code ? 'Copied' : 'Copy link'}
                    </Button>
                  </div>
                )
              })
            )}
          </section>
        )
      })}
      <p role="status">
        {copied === 'Select and copy the code.' ? copied : ''}
      </p>
    </div>
  )
}
export function InvitationCode() {
  const { controller, busy } = useCommunityRewards()
  const [code, setCode] = useState(() => {
      try {
        return rememberedInvitation(localStorage)
      } catch {
        return ''
      }
    }),
    [preview, setPreview] = useState<CommunityInvitationPreview | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false)
  async function inspect() {
    setLoading(true)
    setError('')
    setPreview(null)
    try {
      setPreview(
        await controller.api.invitationPreview(
          code.trim(),
          new AbortController().signal,
        ),
      )
    } catch {
      setError(
        'This invitation could not be checked. Confirm the code and try again.',
      )
    } finally {
      setLoading(false)
    }
  }
  async function accept() {
    if (!preview) return
    const result = await controller.act({
      type: 'accept_invitation',
      code: preview.code,
      preview_version: preview.preview_version,
    })
    if (result) {
      try {
        clearRememberedInvitation(localStorage, preview.code)
      } catch {
        /* Storage is optional. */
      }
      setPreview(null)
      setCode('')
      setError('Invitation accepted.')
    } else {
      await inspect()
    }
  }
  return (
    <section aria-label="Enter invitation code">
      <h3>Have an invitation?</h3>
      <p>
        Review who receives credit before accepting. Joining an alliance still
        follows its normal admission rules.
      </p>
      <form
        className={styles.copyRow}
        onSubmit={(event) => {
          event.preventDefault()
          void inspect()
        }}
      >
        <Field>
          Invitation code
          <Input
            value={code}
            maxLength={200}
            onChange={(event) => {
              setCode(event.target.value)
              setPreview(null)
            }}
          />
        </Field>
        <Button type="submit" disabled={!code.trim() || loading || busy}>
          {loading ? 'Checking…' : 'Preview invitation'}
        </Button>
      </form>
      {error && <p role="status">{error}</p>}
      {preview && (
        <div className={styles.invitationPreview}>
          <h4>Proposed credit</h4>
          <p>
            {preview.inviter_name
              ? `Personal inviter: ${preview.inviter_name}`
              : 'No personal inviter.'}
          </p>
          <p>
            {preview.alliance_name
              ? `Sponsoring alliance: ${preview.alliance_name}`
              : 'No sponsoring alliance.'}
          </p>
          <ConfirmationButton
            dialogTitle="Accept this invitation?"
            confirmLabel="Accept invitation"
            confirmVariant="primary"
            cancelLabel="Go back"
            disabled={busy}
            review={
              <>
                <p>
                  {preview.inviter_name ?? 'Alliance-only invitation'}
                  {preview.alliance_name ? ` · ${preview.alliance_name}` : ''}
                </p>
                <p>This attribution is fixed when accepted.</p>
              </>
            }
            onConfirm={() => void accept()}
          >
            Accept this attribution
          </ConfirmationButton>
        </div>
      )}
    </section>
  )
}
