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
      <InvitationManagement />
    </CommunityRewardsProvider>
  )
}
function InvitationManagement() {
  const { controller, owner, loading, busy, error, pending, visible } =
    useCommunityRewards()
  return (
    <PublicFrame>
      <Heading level={1}>Invite friends to Orbit Imperium</Heading>
      <Text>
        Share your invitation to the galaxy. Your friend reviews who receives
        credit before accepting.
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
          <InvitationLinks />
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
