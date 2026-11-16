import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import type { Popover as BasePopover } from '@base-ui/react/popover'
import { useReducedMotion } from './use-reduced-motion'
import { AnchoredPopover } from './anchored-popover'
import { X } from 'lucide-react'
import { Button } from './button'
import { Heading } from './typography'
import { usePopupFocusReturn } from './use-popup-focus-return'
import styles from './action-popover.module.css'

/** An explicit, nonmodal action dialog anchored to a persistent control. */
export function ActionPopover({
  open,
  onOpenChange,
  anchorRef,
  initialFocusRef,
  title,
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  anchorRef: RefObject<HTMLElement | null>
  initialFocusRef?: RefObject<HTMLElement | null>
  title: string
  description?: string
  children: ReactNode
}) {
  const popup = useRef<HTMLDivElement>(null)
  const actions = useRef<BasePopover.Root.Actions>(null)
  const reduced = useReducedMotion()
  const popupRef = usePopupFocusReturn(open, popup, anchorRef)
  useLayoutEffect(() => {
    // Base UI normally checks CSS transitions on the next frame. Reduced motion
    // has no exit to await, including when the preference changes while open.
    if (!open && reduced) actions.current?.unmount()
  }, [open, reduced])
  return (
    <AnchoredPopover.Root
      open={open}
      onOpenChange={onOpenChange}
      actionsRef={actions}
    >
      <AnchoredPopover.Content
        ref={popupRef}
        inert={!open}
        initialFocus={initialFocusRef}
        finalFocus={anchorRef}
        positionerProps={{
          anchor: anchorRef,
          side: 'bottom',
          align: 'end',
          collisionPadding: 13,
          className: styles.positioner,
        }}
        className={styles.popup}
      >
        <div className={styles.panel}>
          <header className={styles.header}>
            <div>
              <AnchoredPopover.Title render={<Heading level={2} />}>
                {title}
              </AnchoredPopover.Title>
              {description && (
                <AnchoredPopover.Description>
                  {description}
                </AnchoredPopover.Description>
              )}
            </div>
            <AnchoredPopover.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={styles.close}
                  aria-label="Dismiss popover"
                />
              }
            >
              <X size={16} aria-hidden="true" />
            </AnchoredPopover.Close>
          </header>
          {children}
        </div>
      </AnchoredPopover.Content>
    </AnchoredPopover.Root>
  )
}
