import { useId, type ReactNode, type RefObject } from 'react'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  useDismiss,
  useInteractions,
  useRole,
  useTransitionStatus,
  FloatingFocusManager,
  FloatingPortal,
} from '@floating-ui/react'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from './button'
import { Heading } from './typography'
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
  const reduced = useReducedMotion()
  const titleId = useId(),
    descriptionId = useId()
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    elements: { reference: anchorRef.current },
    strategy: 'fixed',
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      // Reserve one CSS pixel for device-pixel rounding of floating coordinates.
      flip({ padding: 13 }),
      shift({ padding: 13 }),
      size({
        padding: 13,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, Math.floor(availableHeight))}px`
        },
      }),
    ],
  })
  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePressEvent: 'pointerdown',
  })
  const role = useRole(context, { role: 'dialog' })
  const { getFloatingProps } = useInteractions([dismiss, role])
  const { isMounted } = useTransitionStatus(context, {
    duration: reduced ? 0 : { open: 140, close: 100 },
  })
  if (!isMounted) return null
  return (
    <FloatingPortal>
      <FloatingFocusManager
        context={context}
        modal={false}
        initialFocus={initialFocusRef ?? 0}
        returnFocus={anchorRef}
        disabled={!open}
      >
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className={styles.positioner}
          inert={!open}
          {...getFloatingProps({
            'aria-labelledby': titleId,
            'aria-describedby': description ? descriptionId : undefined,
          })}
        >
          <motion.div
            className={styles.panel}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: open ? 1 : 0, y: open || reduced ? 0 : 4 }}
            transition={{
              duration: reduced ? 0 : open ? 0.14 : 0.1,
              ease: 'easeOut',
            }}
          >
            <header className={styles.header}>
              <div>
                <Heading level={2} id={titleId}>
                  {title}
                </Heading>
                {description && <p id={descriptionId}>{description}</p>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={styles.close}
                aria-label="Dismiss popover"
                onClick={() => onOpenChange(false)}
              >
                <X size={16} aria-hidden="true" />
              </Button>
            </header>
            {children}
          </motion.div>
        </div>
      </FloatingFocusManager>
    </FloatingPortal>
  )
}
