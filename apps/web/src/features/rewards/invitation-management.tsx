import { useState } from 'react'
import { Field, Select } from '../../ui/form'
import { useAuthSession } from '../../shell/auth-context'
import { AuthenticationPage } from '../../shell/authentication-page'
import {
  CommunityRewardsProvider,
  useCommunityRewards,
} from '../../shell/community-rewards-context'
import { PublicFrame } from '../public-frame'
import { Heading, Text } from '../../ui/typography'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { InvitationCode, InvitationLinks } from './invitations'

const noGameRefresh = () => {}
export function InvitationManagementPage() {
  const { runtime } = useAuthSession()
  if (runtime.status !== 'authenticated')
    return <AuthenticationPage redirect="/invitations" />
  return (
    <CommunityRewardsProvider
      key={runtime.session.csrf}
      csrf={runtime.session.csrf}
      changed={noGameRefresh}
    >
      <InvitationManagement memberships={runtime.session.memberships} />
    </CommunityRewardsProvider>
  )
}
function InvitationManagement({
  memberships,
}: {
  memberships: { universe: string; universe_name: string }[]
}) {
  const [selected, setSelected] = useState('')
  const universe =
    memberships.length === 1
      ? memberships[0].universe
      : memberships.find((m) => m.universe === selected)?.universe

  const { controller, owner, loading, busy, error, pending, visible } =
    useCommunityRewards()
  return (
    <PublicFrame>
      <Heading level={1}>Invite friends to Orbit Imperium</Heading>
      <Text>
        Share your invitation to the galaxy. Your friend follows the link to
        start playing.
      </Text>
      {error && <p role="alert">{error}</p>}
      {pending && (
        <Button disabled={busy} onClick={() => void controller.retry()}>
          Retry pending change
        </Button>
      )}
      {loading && !owner ? (
        <p role="status">Loading your invitations…</p>
      ) : visible ? (
        <>
          {memberships.length > 1 && (
            <Field>
              Invite to universe
              <Select
                value={universe ?? ''}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Choose your universe</option>
                {memberships.map((m) => (
                  <option key={m.universe} value={m.universe}>
                    {m.universe_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {memberships.length === 0 && (
            <p>
              Join a universe before inviting friends to play there with you.
            </p>
          )}
          <InvitationLinks universe={universe} />
          <InvitationCode />
        </>
      ) : (
        <p>Invitations are not currently available on this server.</p>
      )}
      <p>
        <Button
          variant="ghost"
          disabled={busy || loading}
          onClick={() => void controller.load()}
        >
          Refresh invitations
        </Button>
      </p>
      <p>
        <ButtonLinkAnchor variant="secondary" href="/">
          Continue to your empire
        </ButtonLinkAnchor>
      </p>
    </PublicFrame>
  )
}
