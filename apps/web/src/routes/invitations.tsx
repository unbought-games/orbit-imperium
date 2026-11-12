import { createFileRoute } from '@tanstack/react-router'
import { InvitationManagementPage } from '../features/rewards/invitation-management'
export const Route = createFileRoute('/invitations')({
  component: InvitationManagementPage,
})
