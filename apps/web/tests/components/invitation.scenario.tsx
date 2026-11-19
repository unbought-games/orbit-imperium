import { InvitationView } from '../../src/features/rewards/invitation-entry'
import { personalInvitation } from '../fixtures/personal-invitation'

const code = 'inv_fixture-A_9'
const preview = personalInvitation(code, 'universe', 'epoch', '/brand-mark.svg')

export function InvitationScenario() {
  return (
    <InvitationView
      code={code}
      authenticated={false}
      entry={{
        preview,
        loading: false,
        busy: false,
        error: '',
        enter: async () => {
          throw Error('Anonymous invitation cannot enroll')
        },
        retry: () => {
          throw Error('Ready invitation cannot retry loading')
        },
      }}
    />
  )
}
