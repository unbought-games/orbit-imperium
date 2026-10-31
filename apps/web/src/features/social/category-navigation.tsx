import { Menu } from '@base-ui/react/menu'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '../../ui/button'
import { useMobileLayout } from '../../ui/use-mobile-layout'
import styles from './category-navigation.module.css'
import menuStyles from './social-menu.module.css'

const categories = [
  'Conversations',
  'Circulars',
  'Friends',
  'Requests',
  'Blocks',
] as const
export type MessageCategory = (typeof categories)[number]

/** The header keeps one selected category across desktop and mobile layouts. */
export function CategoryNavigation({
  value,
  onChange,
}: {
  value: MessageCategory
  onChange: (value: MessageCategory) => void
}) {
  const mobile = useMobileLayout()
  if (!mobile)
    return (
      <div
        className={styles.categories}
        role="group"
        aria-label="Message categories"
      >
        {categories.map((category) => (
          <Button
            key={category}
            size="small"
            variant="ghost"
            aria-pressed={value === category}
            onClick={() => onChange(category)}
          >
            {category}
          </Button>
        ))}
      </div>
    )
  return (
    <Menu.Root>
      <Menu.Trigger
        render={<Button variant="ghost" size="small" />}
        aria-label="Message categories"
      >
        {value}
        <ChevronDown size={16} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={menuStyles.positioner}
        >
          <Menu.Popup
            className={menuStyles.menu}
            aria-label="Message categories"
          >
            <Menu.RadioGroup
              value={value}
              onValueChange={(next) => onChange(next as MessageCategory)}
            >
              {categories.map((category) => (
                <Menu.RadioItem
                  key={category}
                  value={category}
                  closeOnClick
                  className={menuStyles.menuItem}
                >
                  <span className={menuStyles.indicator}>
                    <Menu.RadioItemIndicator>
                      <Check size={16} aria-hidden="true" />
                    </Menu.RadioItemIndicator>
                  </span>
                  {category}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
