import { rememberedInvitation } from '../../client-model/community-invitation'
import { useState } from 'react'
import {
  copyGameInvitation,
  invitationMatches,
  type InvitationShareStatus,
} from '../../client-model/invitation-sharing'
import {
  invitationShareUrl,
  invitationEntryPath,
} from '../../client-model/invitation-entry'
import { useOptionalCommunityRewards } from '../../shell/community-rewards-context'
import { Button } from '../../ui/button'
import { Field, Input } from '../../ui/form'
import styles from './rewards.module.css'
export function InvitationLinks({
  alliance,
  universe = alliance?.universe_id,
  publicOnly = false,
  publicEnabled = true,
  entryPath,
}: {
  universe?: string
  alliance?: { universe_id: string; epoch_id: string; alliance_id: string }
  publicOnly?: boolean
  publicEnabled?: boolean
  entryPath?: string
}) {
  const rewards = useOptionalCommunityRewards()
  const [shared, setShared] = useState<InvitationShareStatus>()
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
        const invitations = owner.invitations.filter((i) =>
          invitationMatches(i, kind, alliance, universe),
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
                  ? 'Credit goes to you and this alliance. Recruitment permission is checked again when your friend starts playing.'
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
                disabled={busy || !universe || !owner.capabilities.invite}
                onClick={() =>
                  void copyGameInvitation({
                    kind,
                    universe: universe!,
                    alliance,
                    origin: location.origin,
                    entryPath,
                    controller,
                    copy: (url) => navigator.clipboard.writeText(url),
                  }).then(setShared)
                }
              >
                Copy invite link
              </Button>
            ) : (
              invitations.map((invitation) => {
                const url = invitationShareUrl(
                  invitation,
                  location.origin,
                  entryPath,
                )
                return (
                  <div className={styles.copyRow} key={invitation.code}>
                    <label>
                      Invitation link
                      <input
                        readOnly
                        value={url ?? ''}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <Button
                      variant="secondary"
                      disabled={!url}
                      onClick={() =>
                        void copyGameInvitation({
                          existing: invitation,
                          kind,
                          universe: universe!,
                          alliance,
                          origin: location.origin,
                          entryPath,
                          controller,
                          copy: (url) => navigator.clipboard.writeText(url),
                        }).then(setShared)
                      }
                    >
                      {shared?.code === invitation.code &&
                      shared.status === 'copied'
                        ? 'Copied'
                        : 'Copy invite link'}
                    </Button>
                    {!url && (
                      <p>This invitation is unavailable on this server.</p>
                    )}
                  </div>
                )
              })
            )}
          </section>
        )
      })}
      <p role="status">
        {shared?.status === 'select'
          ? 'Select and copy the invitation link above.'
          : shared?.status === 'unavailable'
            ? 'This invitation is unavailable on this server.'
            : ''}
      </p>
    </div>
  )
}
export function InvitationCode() {
  const [code, setCode] = useState(() => {
    try {
      return rememberedInvitation(localStorage)
    } catch {
      return ''
    }
  })
  const path = invitationEntryPath(code.trim())
  return (
    <section aria-label="Enter invitation code">
      <h3>Have an invitation code?</h3>
      <form
        className={styles.copyRow}
        onSubmit={(event) => {
          event.preventDefault()
          if (path) window.location.assign(path)
        }}
      >
        <Field>
          Invitation code
          <Input
            value={code}
            maxLength={200}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={!path}>
          Play Orbit Imperium
        </Button>
      </form>
    </section>
  )
}
