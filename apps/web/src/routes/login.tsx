import { createFileRoute } from '@tanstack/react-router'
import { AuthenticationPage } from '../shell/authentication-page'
import { validateAuthSearch } from '../shell/auth-search'
export const Route = createFileRoute('/login')({
  validateSearch: validateAuthSearch,
  component: LoginRoute,
})
function LoginRoute() {
  const { redirect } = Route.useSearch()
  return <AuthenticationPage redirect={redirect} />
}
