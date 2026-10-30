import { useRef, useState } from 'react'
import { Menu } from '@base-ui/react/menu'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Ellipsis, Trash2 } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import type { BoundView } from '../client-model/commands'
import { Button } from '../ui/button'
import { bodyName, coordinates } from '../ui/format'
import { usePlanetAbandonment } from './use-planet-abandonment'
import { AbandonmentLosses } from './abandonment-losses'
import styles from './planet-actions.module.css'

export function PlanetActions({
  model,
  body,
}: {
  model: Coordinator
  body: BoundView['bodies'][number]
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const handingOff = useRef(false)
  const action = usePlanetAbandonment(model, body.id)
  return (
    <>
      <Menu.Root
        onOpenChange={(value) => {
          if (value) handingOff.current = false
        }}
      >
        <Menu.Trigger
          ref={trigger}
          render={
            <Button variant="ghost" size="icon" className={styles.trigger} />
          }
          aria-label={`Planet actions ${coordinates(body)}`}
        >
          <Ellipsis size={20} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            align="end"
            sideOffset={4}
            className={styles.positioner}
          >
            <Menu.Popup
              className={styles.menu}
              finalFocus={() => !handingOff.current}
            >
              <Menu.Item
                className={styles.destructive}
                onClick={() => {
                  handingOff.current = true
                  setOpen(true)
                  void action.review()
                }}
              >
                <Trash2 size={16} /> Abandon planet
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={styles.backdrop} />
          <AlertDialog.Popup className={styles.dialog} finalFocus={trigger}>
            <AlertDialog.Title>Abandon {bodyName(body)}?</AlertDialog.Title>
            <div className={styles.content}>
              <AlertDialog.Description>
                {coordinates(body)} · This permanently deletes this planet and
                its moon. All resources, buildings, ships, defenses and
                unfinished work are lost without refund. Completed research
                survives.
              </AlertDialog.Description>
              {action.busy && !action.quote && (
                <p role="status">Checking this planet…</p>
              )}
              {action.error && <p role="alert">{action.error}</p>}
              {action.quote && (
                <>
                  {action.quote.blockers.length > 0 && (
                    <ul className={styles.blockers} role="alert">
                      {action.quote.blockers.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  <AbandonmentLosses losses={action.quote.losses} />
                  <p className={styles.timing}>
                    Position available again:{' '}
                    <strong>
                      {new Date(action.quote.release_at).toLocaleString()}
                    </strong>
                    <br />
                    {new Date(action.quote.release_at)
                      .toISOString()
                      .replace('T', ' ')
                      .replace('.000Z', ' UTC')}
                  </p>
                  <p className={styles.note}>
                    Production continues until abandonment. Incoming enemy
                    fleets do not prevent deletion. This cannot be undone.
                  </p>
                </>
              )}
              {action.status && <p role="status">{action.status}</p>}
            </div>
            <div className={styles.actions}>
              <AlertDialog.Close render={<Button variant="secondary" />}>
                No, keep planet
              </AlertDialog.Close>
              {!action.busy &&
                !action.pending &&
                (!action.quote || action.quote.blockers.length > 0) && (
                  <Button
                    variant="secondary"
                    onClick={() => void action.review()}
                  >
                    Review losses
                  </Button>
                )}
              <Button
                variant="destructive"
                disabled={
                  !action.quote ||
                  !!action.quote.blockers.length ||
                  action.busy ||
                  action.pending ||
                  !action.ready
                }
                onClick={() => void action.abandon()}
              >
                Yes, abandon planet
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  )
}
