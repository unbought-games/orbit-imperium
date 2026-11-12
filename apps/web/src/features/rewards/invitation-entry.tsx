import { useEffect } from 'react'
import { useAuthSession } from '../../shell/auth-context'
import { useInvitationEntry } from '../../client-model/use-invitation-entry'
import {
  invitationEntryPath,
  invitationContinuation,
} from '../../client-model/invitation-entry'
import { oidcLoginPath } from '../../client-model/use-oidc'
import { rememberInvitation } from '../../client-model/community-invitation'
import { PublicFrame } from '../public-frame'
import { ButtonLinkAnchor } from '../../ui/button'
import { Heading, Text } from '../../ui/typography'
import styles from './invitation-entry.module.css'

export function InvitationEntryPage({
  code,
  continuation,
}: {
  code: string
  continuation?: string
}) {
  const { runtime } = useAuthSession()
  const csrf =
    runtime.status === 'authenticated' ? runtime.session.csrf : undefined
  return (
    <InvitationLanding
      key={`${code}:${csrf ?? runtime.status}`}
      code={code}
      continuation={continuation}
      csrf={csrf}
    />
  )
}
function InvitationLanding({
  code,
  continuation,
  csrf,
}: {
  code: string
  continuation?: string
  csrf?: string
}) {
  const { preview } = useInvitationEntry(code, csrf)
  const onward = invitationContinuation(continuation, preview?.alliance)
  const returnPath = invitationEntryPath(code, onward) ?? '/'
  useEffect(() => {
    document.title = 'You’re invited · Orbit Imperium'
  }, [])
  useEffect(() => {
    if (!csrf) return
    try {
      rememberInvitation(localStorage, code)
    } catch {
      /* Play never depends on optional storage. */
    }
    // Native context survives in the return path. Neither preview nor attribution
    // is a readiness gate for a player who is already signed in.
    window.location.replace(onward)
  }, [csrf, code, onward])
  if (csrf) return <p role="status">Opening Orbit Imperium…</p>
  return (
    <PublicFrame>
      <Heading level={1}>Your galaxy awaits.</Heading>
      <Text>
        Build your world, explore the galaxy and find your allies in Orbit
        Imperium.
      </Text>
      {preview?.inviter_name && <p>Invited by {preview.inviter_name}.</p>}
      {preview?.alliance_name && (
        <p>
          Meet {preview.alliance_name}. Joining the alliance follows its normal
          admission rules.
        </p>
      )}
      <div className={styles.actions}>
        <ButtonLinkAnchor href={oidcLoginPath(returnPath)}>
          Play Orbit Imperium
        </ButtonLinkAnchor>
      </div>
    </PublicFrame>
  )
}
