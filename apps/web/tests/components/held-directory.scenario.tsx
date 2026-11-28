import { PublicRecruitmentDirectory } from '../../src/features/alliances/recruitment-directory'
import { id } from '../../src/test-support/bootstrap'

export function HeldDirectory() {
  return <PublicRecruitmentDirectory universe={id(3)} />
}
