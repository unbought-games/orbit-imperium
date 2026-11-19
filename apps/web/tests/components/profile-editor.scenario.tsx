import { EmpireProfilePage } from '../../src/features/empire-history/profile-page'
import { binding } from '../../src/test-support/empire'

export function ProfileEditorScenario() {
  return <EmpireProfilePage player={binding.player} />
}
