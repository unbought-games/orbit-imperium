import styles from './social.module.css'
import type { SocialAction, SocialContact } from '../../client-model/social'
import { Button } from '../../ui/button'
export function ContactActions({
  contact: c,
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
    <div className={styles.actions}>
      {!c.blocked && !c.request && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void run({ type: 'RequestFriend', player: c.player })}
        >
          Add friend
        </Button>
      )}
      {c.request && (
        <>
          {!c.accepted && c.requested_by !== self && (
            <Button
              disabled={busy}
              onClick={() =>
                void run({
                  type: 'AcceptFriend',
                  player: c.player,
                  request: c.request!,
                })
              }
            >
              Accept friend
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run({
                type: 'RemoveFriend',
                player: c.player,
                request: c.request!,
              })
            }
          >
            {c.accepted
              ? 'Remove friend'
              : c.requested_by === self
                ? 'Cancel request'
                : 'Decline request'}
          </Button>
        </>
      )}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() =>
          void run({ type: c.blocked ? 'Unblock' : 'Block', player: c.player })
        }
      >
        {c.blocked ? 'Unblock player' : 'Block player'}
      </Button>
    </div>
  )
}
