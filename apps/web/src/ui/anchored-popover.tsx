import { Popover } from '@base-ui/react/popover'
import type { ComponentProps } from 'react'
import { classes } from './classes'
import styles from './anchored-popover.module.css'

function Root({ onOpenChange, ...props }: ComponentProps<typeof Popover.Root>) {
  return (
    <Popover.Root
      {...props}
      onOpenChange={(open, details) => {
        // Snapshot updates may dispatch a click without pointer interaction.
        // These are not outside presses and must not dismiss an open disclosure.
        if (details.reason === 'outside-press' && !details.event.isTrusted) {
          details.cancel()
          return
        }
        // Escape belongs to the innermost popup, including in a native dialog.
        if (details.reason === 'escape-key') details.event.preventDefault()
        onOpenChange?.(open, details)
      }}
    />
  )
}

export type AnchoredPopoverContentProps = ComponentProps<
  typeof Popover.Popup
> & {
  positionerProps?: ComponentProps<typeof Popover.Positioner>
  portalProps?: ComponentProps<typeof Popover.Portal>
}

function Content({
  positionerProps,
  portalProps,
  ...props
}: AnchoredPopoverContentProps) {
  return (
    <Popover.Portal {...portalProps}>
      <Popover.Positioner
        sideOffset={8}
        collisionPadding={12}
        collisionAvoidance={{
          side: 'flip',
          align: 'shift',
          fallbackAxisSide: 'none',
        }}
        positionMethod="fixed"
        {...positionerProps}
        className={(state) =>
          classes(
            styles.positioner,
            typeof positionerProps?.className === 'function'
              ? positionerProps.className(state)
              : positionerProps?.className,
          )
        }
      >
        <Popover.Popup {...props} />
      </Popover.Positioner>
    </Popover.Portal>
  )
}

function Arrow() {
  return (
    <Popover.Arrow className={styles.arrow}>
      <svg width="14" height="7" viewBox="0 0 14 7" aria-hidden="true">
        <path d="M0 7 7 0 14 7" />
      </svg>
    </Popover.Arrow>
  )
}

/** Shared geometry and composition; callers own their content and open policy. */
export const AnchoredPopover = {
  Root,
  Trigger: Popover.Trigger,
  Content,
  Arrow,
  Title: Popover.Title,
  Description: Popover.Description,
  Close: Popover.Close,
}
