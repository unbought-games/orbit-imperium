import { useId, useState, type ReactNode } from 'react'
import { Tooltip } from '@base-ui/react/tooltip'
import { classes } from './classes'
import styles from './info-tooltip.module.css'

/** Status explanations work on hover, keyboard focus, and touch. */
export function InfoTooltip({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <Tooltip.Root open={open} onOpenChange={setOpen} triggerId={id}>
      <Tooltip.Trigger
        id={id}
        type="button"
        className={classes(styles.trigger, className)}
        aria-label={label}
        aria-describedby={open ? `${id}-description` : undefined}
        delay={200}
        closeOnClick={false}
        onClick={() => setOpen(true)}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          side="top"
          sideOffset={7}
          className={styles.positioner}
        >
          <Tooltip.Popup
            id={`${id}-description`}
            role="tooltip"
            className={styles.popup}
          >
            <strong>{label}</strong>
            {description && <span>{description}</span>}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
