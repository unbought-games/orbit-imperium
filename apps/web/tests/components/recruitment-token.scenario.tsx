import { PublicAlliancePage } from '../../src/features/alliances/public-page'
import { matchPublicRoute } from '../../src/public-route-patterns'

export function RecruitmentToken() {
  const params = matchPublicRoute('invitation', location.pathname)
  if (!params) throw Error('Expected a public alliance token path')
  return <PublicAlliancePage universe={params[1]} invitation={params[2]} />
}
