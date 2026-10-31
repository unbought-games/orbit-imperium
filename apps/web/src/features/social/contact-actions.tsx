import type { SocialAction, SocialContact } from '../../client-model/social'
import { ThreadActions } from './thread-actions'
export function ContactActions({
  contact,
  self,
  run,
  busy,
}: {
  contact: SocialContact
  self: string
  run: (a: SocialAction) => Promise<boolean>
  busy: boolean
}) {
  return (
    <ThreadActions
      contact={contact}
      self={self}
      run={run}
      busy={busy}
      label={`Contact options for ${contact.username}`}
    />
  )
}
