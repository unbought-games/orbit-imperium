import { createFileRoute } from '@tanstack/react-router'
import { InvitationEntryPage } from '../features/rewards/invitation-entry'
import { allianceInvitationContinuation } from '../client-model/invitation-entry'
export const Route = createFileRoute('/invite/$code')({
  validateSearch: (search: Record<string, unknown>) => ({
    continue: allianceInvitationContinuation(search.continue),
  }),
  component: InvitationRoute,
})
function InvitationRoute() {
  const { code } = Route.useParams()
  const search = Route.useSearch()
  return <InvitationEntryPage code={code} continuation={search.continue} />
}
