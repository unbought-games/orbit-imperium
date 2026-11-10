import { useRef, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { Dialog } from '@base-ui/react/dialog'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Ellipsis, Shield, UserMinus } from 'lucide-react'
import { can, type AllianceDetail } from '../../client-model/alliances'
import { Button } from '../../ui/button'
import { MemberRoleEditor } from './member-role-editor'
import type { AllianceMember } from './roster-model'
import type { Run } from './shared'
import styles from './roster.module.css'

export function MemberActions({
  detail,
  member,
  player,
  run,
  busy,
}: {
  detail: AllianceDetail
  member: AllianceMember
  player: string
  run: Run
  busy: boolean
}) {
  const [view, setView] = useState<'roles' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  const assign = can(detail, 'AssignRoles') && member.player !== detail.leader
  const remove =
    can(detail, 'KickMembers') &&
    member.player !== detail.leader &&
    member.player !== player
  if (!assign && !remove) return null
  return (
    <>
      <Menu.Root
        onOpenChange={(open) => {
          if (open) handingOff.current = false
        }}
      >
        <Menu.Trigger
          ref={trigger}
          render={<Button variant="ghost" size="icon-touch" />}
          aria-label={`Member actions: ${member.username}`}
          title="Member actions"
        >
          <Ellipsis size={16} aria-hidden="true" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className={styles.positioner}
          >
            <Menu.Popup
              className={styles.menu}
              finalFocus={() => !handingOff.current}
            >
              {assign && (
                <Menu.Item
                  className={styles.menuItem}
                  disabled={busy}
                  onClick={() => {
                    handingOff.current = true
                    setView('roles')
                  }}
                >
                  <Shield size={16} aria-hidden="true" />
                  Assign roles
                </Menu.Item>
              )}
              {remove && (
                <Menu.Item
                  className={`${styles.menuItem} ${styles.destructive}`}
                  disabled={busy}
                  onClick={() => {
                    handingOff.current = true
                    setError('')
                    setView('remove')
                  }}
                >
                  <UserMinus size={16} aria-hidden="true" />
                  Remove member
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Dialog.Root
        open={view === 'roles' && assign}
        onOpenChange={(open) => {
          if (!open) setView(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className={styles.backdrop} />
          <Dialog.Popup className={styles.dialog} finalFocus={trigger}>
            <Dialog.Title>Roles for {member.username}</Dialog.Title>
            <Dialog.Description>
              Default membership permissions always apply.
            </Dialog.Description>
            <MemberRoleEditor
              detail={detail}
              member={member}
              run={run}
              busy={busy}
              onClose={() => setView(null)}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root
        open={view === 'remove' && remove}
        onOpenChange={(open) => {
          if (!open) setView(null)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.backdrop} />
          <AlertDialog.Popup className={styles.dialog} finalFocus={trigger}>
            <AlertDialog.Title>Remove {member.username}?</AlertDialog.Title>
            <AlertDialog.Description>
              They will lose access to {detail.summary.name} immediately.
            </AlertDialog.Description>
            {error && (
              <p role="alert" className={styles.warning}>
                {error}
              </p>
            )}
            <div className={styles.dialogActions}>
              <AlertDialog.Close render={<Button variant="secondary" />}>
                Keep member
              </AlertDialog.Close>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void run({
                    type: 'Kick',
                    alliance: detail.summary.id,
                    player: member.player,
                  }).then((ok) => {
                    if (ok) setView(null)
                    else
                      setError(
                        'Could not remove this member. Close this dialog to review the alliance status.',
                      )
                  })
                }
              >
                Remove member
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
