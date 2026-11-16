import {
  useId,
  useRef,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { AnchoredPopover } from './anchored-popover'
import { classes } from './classes'
import { usePopupFocusReturn } from './use-popup-focus-return'
import styles from './advisor-bubble.module.css'

export type BubbleTrigger = (
  props?: ComponentPropsWithRef<'button'>,
  speaking?: boolean,
) => ReactNode

/** An unsolicited, nonmodal message: never steal focus or dismiss on outside interaction. */
export function AdvisorBubble({
  open,
  active,
  onOpenChange,
  trigger,
  triggerLabel,
  triggerRef,
  label,
  children,
  className,
  ...popupProps
}: {
  open: boolean
  active: boolean
  onOpenChange: (open: boolean) => void
  trigger: BubbleTrigger
  triggerLabel: string
  triggerRef: RefObject<HTMLButtonElement | null>
  label: string
  children: ReactNode
  className?: string
  'data-testid'?: string
}) {
  const id = useId()
  const popup = useRef<HTMLDivElement>(null)
  const popupRef = usePopupFocusReturn(open, popup, triggerRef)
  return (
    <AnchoredPopover.Root
      open={open}
      triggerId={id}
      onOpenChange={(next, details) => {
        if (
          details.reason === 'outside-press' ||
          details.reason === 'focus-out'
        ) {
          details.cancel()
          return
        }
        onOpenChange(next)
      }}
    >
      <AnchoredPopover.Trigger
        id={id}
        ref={triggerRef}
        disabled={!active}
        aria-label={triggerLabel}
        render={(props) =>
          trigger(active ? props : undefined, open) as ReactElement
        }
      />
      {open && (
        <AnchoredPopover.Content
          ref={popupRef}
          initialFocus={false}
          finalFocus={triggerRef}
          aria-label={label}
          positionerProps={{
            side: 'top',
            align: 'end',
            sideOffset: 16,
            className: styles.positioner,
          }}
          {...popupProps}
          className={classes(styles.bubble, className)}
        >
          <AnchoredPopover.Arrow />
          {children}
        </AnchoredPopover.Content>
      )}
    </AnchoredPopover.Root>
  )
}
