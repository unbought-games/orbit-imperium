import { createFileRoute } from '@tanstack/react-router'
import { AuthenticationPage } from '../shell/authentication-page'
import { validateAuthSearch } from '../shell/auth-search'
export const Route = createFileRoute('/signup')({
  validateSearch: validateAuthSearch,
  component: SignupRoute,
})
function SignupRoute() {
  const { redirect } = Route.useSearch()
  return <AuthenticationPage signup redirect={redirect} />
}
