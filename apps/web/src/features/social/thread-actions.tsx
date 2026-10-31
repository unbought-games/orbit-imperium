import { Menu } from '@base-ui/react/menu'
import {
  Ellipsis,
  EyeOff,
  ShieldBan,
  ShieldCheck,
  UserPlus,
  UserMinus,
  UserCheck,
} from 'lucide-react'
import type { SocialAction, SocialContact } from '../../client-model/social'
import { Button } from '../../ui/button'
import { contactOptions } from './contact-options'
import styles from './social-menu.module.css'

const icons = {
  RequestFriend: UserPlus,
  AcceptFriend: UserCheck,
  RemoveFriend: UserMinus,
  Block: ShieldBan,
  Unblock: ShieldCheck,
}
export function ThreadActions({
  contact,
  self,
  run,
  busy,
  hide,
  label = 'Conversation options',
}: {
  contact: SocialContact
  self: string
  run: (a: SocialAction) => Promise<boolean>
  busy: boolean
  hide?: () => Promise<void>
  label?: string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={label}
        title={label}
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
          <Menu.Popup className={styles.menu} aria-label={label}>
            {contactOptions(contact, self).map(({ label, action }) => {
              const Icon = icons[action.type]
              return (
                <Menu.Item
                  key={action.type}
                  className={styles.menuItem}
                  disabled={busy}
                  onClick={() => void run(action)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                </Menu.Item>
              )
            })}
            {hide && (
              <>
                <Menu.Separator className={styles.separator} />
                <Menu.Item
                  className={styles.menuItem}
                  disabled={busy}
                  onClick={() => void hide()}
                >
                  <EyeOff size={16} aria-hidden="true" />
                  Hide conversation
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
