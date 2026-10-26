import type { ReactNode } from 'react'
import { Select } from '@base-ui/react/select'
import { Check, ChevronDown } from 'lucide-react'
import { classes } from './classes'
import styles from './rich-select.module.css'

export type RichSelectOption = {
  value: string
  label: string
  content: ReactNode
}

/** A controlled, single-value select with custom option and trigger content. */
export function RichSelect({
  label,
  value,
  options,
  children,
  className,
  onValueChange,
  disabled = false,
  anchor,
  title,
  popupClassName,
}: {
  label: string
  disabled?: boolean
  anchor?: Select.Positioner.Props['anchor']
  title?: string
  popupClassName?: string
  value?: string
  options: RichSelectOption[]
  children: ReactNode
  className?: string
  onValueChange: (value: string) => void
}) {
  return (
    <Select.Root
      disabled={disabled}
      value={value ?? null}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <Select.Trigger
        aria-label={label}
        title={title}
        data-value={value}
        className={classes(styles.trigger, className)}
      >
        <Select.Value className={styles.value}>{() => children}</Select.Value>
        <Select.Icon className={styles.icon}>
          <ChevronDown size={14} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          anchor={anchor}
          align="start"
          sideOffset={6}
          collisionPadding={8}
          alignItemWithTrigger={false}
          className={styles.positioner}
        >
          <Select.Popup className={classes(styles.popup, popupClassName)}>
            <Select.List className={styles.list} aria-label={label}>
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  data-value={option.value}
                  className={styles.item}
                >
                  <Select.ItemText className={styles.itemText}>
                    {option.content}
                  </Select.ItemText>
                  <Select.ItemIndicator className={styles.indicator}>
                    <Check size={18} aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}
