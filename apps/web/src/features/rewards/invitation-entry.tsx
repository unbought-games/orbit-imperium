import { useEffect } from 'react'
import { useAuthSession } from '../../shell/auth-context'
import { useInvitationEntry } from '../../client-model/use-invitation-entry'
import { invitationEntryPath } from '../../client-model/invitation-entry'
import { oidcLoginPath } from '../../client-model/use-oidc'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { EmpireInsignia } from '../empire-insignia'
import { PlayerName } from '../player-name'
import { resolvePlanetArt } from '../../ui/artwork'
import { InvitationPass } from './invitation-pass'

export function InvitationEntryPage({
  code,
  continuation,
}: {
  code: string
  continuation?: string
}) {
  const { runtime } = useAuthSession()
  const authenticated = runtime.status === 'authenticated'
  return (
    <InvitationLanding
      key={`${code}:${authenticated ? runtime.session.csrf : runtime.status}`}
      code={code}
      continuation={continuation}
      authenticated={authenticated}
    />
  )
}
function InvitationLanding({
  code,
  continuation,
  authenticated,
}: {
  code: string
  continuation?: string
  authenticated: boolean
}) {
  const entry = useInvitationEntry(code, authenticated, continuation)
  const universe = entry.preview?.universe
  const inviter = entry.preview?.inviter
  const ready = entry.preview?.status === 'ready' && !!universe
  const closed =
    universe &&
    (!universe.signup_enabled ||
      (universe.max_players !== null &&
        universe.players >= universe.max_players))
  useEffect(() => {
    document.title =
      inviter && universe
        ? `${inviter.name} invites you to ${universe.name} · Orbit Imperium`
        : 'Your invitation · Orbit Imperium'
  }, [inviter, universe])
  const primary = entry.loading ? (
    <Button disabled>Preparing your invitation…</Button>
  ) : !ready ? (
    <ButtonLinkAnchor href="/">Explore Orbit Imperium</ButtonLinkAnchor>
  ) : authenticated ? (
    <Button disabled={entry.busy} onClick={() => void entry.enter()}>
      {entry.busy ? `Joining ${universe.name}…` : 'Try joining again'}
    </Button>
  ) : (
    <ButtonLinkAnchor
      href={oidcLoginPath(
        invitationEntryPath(code, continuation),
        false,
        !closed,
      )}
    >
      {closed ? 'Sign in to your empire' : 'Join this universe'}
    </ButtonLinkAnchor>
  )
  return (
    <InvitationPass
      sender={
        inviter
          ? {
              name: inviter.name,
              empire: inviter.empire_name,
              title: inviter.title.label,
            }
          : undefined
      }
      senderIdentity={
        inviter ? (
          <PlayerName
            player="invitation-sender"
            fallback={inviter.name}
            interactive={false}
            showInsignia={false}
          />
        ) : undefined
      }
      emblem={
        inviter?.insignia ? (
          <EmpireInsignia
            appearance={inviter.insignia}
            size="medium"
            label={`${inviter.name}’s emblem`}
          />
        ) : undefined
      }
      universe={
        universe
          ? {
              name: universe.name,
              artwork: resolvePlanetArt(universe.art_slot),
              summary: `A persistent universe shared by ${universe.players.toLocaleString()} ${universe.players === 1 ? 'commander' : 'commanders'}.`,
              facts: [
                { label: 'Universe speed', value: `${universe.speed}×` },
                { label: 'Galaxies', value: String(universe.galaxies) },
                {
                  label: 'Systems per galaxy',
                  value: String(universe.systems_per_galaxy),
                },
              ],
            }
          : undefined
      }
      loading={entry.loading}
      unavailable={!entry.loading && !ready}
      notice={
        entry.error ? (
          <p role="alert">
            {entry.error}{' '}
            {!ready && (
              <Button variant="ghost" onClick={entry.retry}>
                Retry invitation
              </Button>
            )}
          </p>
        ) : !entry.loading && !ready ? (
          <p>
            This older or unavailable invitation has no current destination. Ask
            your friend for a fresh link.
          </p>
        ) : closed ? (
          <p>
            This universe is currently closed or full for new empires. Existing
            members can still return.
          </p>
        ) : !inviter && entry.preview?.alliance ? (
          <p>
            An invitation from {entry.preview.alliance.name}. Joining the
            alliance follows its normal admission rules.
          </p>
        ) : undefined
      }
      primaryAction={primary}
    />
  )
}
