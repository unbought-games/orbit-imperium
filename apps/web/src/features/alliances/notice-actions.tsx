import { useRef, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import type { components } from '../../contracts'
import { Button } from '../../ui/button'
import type { Run } from './shared'
import styles from './board.module.css'

type Post = components['schemas']['AlliancePost']
export function NoticeActions({
  post,
  alliance,
  editable,
  pinnable,
  busy,
  run,
  onEdit,
}: {
  post: Post
  alliance: string
  editable: boolean
  pinnable: boolean
  busy: boolean
  run: Run
  onEdit: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  if (!editable && !pinnable) return null
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
          aria-label={`Notice actions${post.title ? `: ${post.title}` : ''}`}
          title="Notice actions"
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
              {editable && (
                <Menu.Item
                  className={styles.menuItem}
                  disabled={busy}
                  onClick={() => {
                    handingOff.current = true
                    onEdit()
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Edit notice
                </Menu.Item>
              )}
              {pinnable && (
                <Menu.Item
                  className={styles.menuItem}
                  disabled={busy}
                  onClick={() =>
                    void run({
                      type: 'PinPost',
                      alliance,
                      post: post.id,
                      pinned: !post.pinned,
                    })
                  }
                >
                  {post.pinned ? (
                    <PinOff size={16} aria-hidden="true" />
                  ) : (
                    <Pin size={16} aria-hidden="true" />
                  )}
                  {post.pinned ? 'Unpin notice' : 'Pin notice'}
                </Menu.Item>
              )}
              {editable && (
                <Menu.Item
                  className={`${styles.menuItem} ${styles.destructive}`}
                  disabled={busy}
                  onClick={() => {
                    handingOff.current = true
                    setDeleting(true)
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Delete notice
                </Menu.Item>
              )}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <AlertDialog.Root open={deleting} onOpenChange={setDeleting}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.backdrop} />
          <AlertDialog.Popup className={styles.dialog} finalFocus={trigger}>
            <AlertDialog.Title>Delete notice?</AlertDialog.Title>
            <AlertDialog.Description>
              {post.title
                ? `“${post.title}” will be permanently removed.`
                : 'This notice will be permanently removed.'}
            </AlertDialog.Description>
            <div className={styles.editorActions}>
              <AlertDialog.Close render={<Button variant="secondary" />}>
                Keep notice
              </AlertDialog.Close>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  void run({
                    type: 'DeletePost',
                    alliance,
                    post: post.id,
                  }).then((ok) => {
                    if (ok) setDeleting(false)
                  })
                }}
              >
                Delete notice
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
