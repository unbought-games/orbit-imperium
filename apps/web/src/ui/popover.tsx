import {
  cloneElement,
  type ComponentPropsWithRef,
  type ReactElement,
} from 'react'
import { Button } from './button'
import { useState, type ReactNode } from 'react'
import {
  autoUpdate,
  flip,
  offset,
  shift,
  safePolygon,
  useFloating,
  useClick,
  useDismiss,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  FloatingFocusManager,
  FloatingPortal,
} from '@floating-ui/react'
import styles from './popover.module.css'

const linkControlProps = { 'data-touch-control': '' }

/** Read-only details, available with a mouse, keyboard, or touch. */
export function Popover({
  label,
  trigger,
  children,
  className,
  link,
}: {
  label: string
  trigger: ReactNode
  children: ReactNode
  className?: string
  link?: ReactElement<ComponentPropsWithRef<'a'>>
}) {
  const [open, setOpen] = useState(false)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom',
    middleware: [offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  })
  const hover = useHover(context, {
    mouseOnly: true,
    delay: { open: 150 },
    handleClose: safePolygon(),
  })
  const focus = useFocus(context)
  const click = useClick(context, { enabled: !link })
  // Dismiss these details before an enclosing quote handles Escape.
  const dismiss = useDismiss(context, { capture: { escapeKey: true } })
  const role = useRole(context, { role: link ? 'tooltip' : 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    click,
    dismiss,
    role,
  ])
  return (
    <>
      {link ? (
        cloneElement(link, {
          ...linkControlProps,
          ref: refs.setReference,
          className,
          ...getReferenceProps({
            'aria-label': link.props['aria-label'] ?? label,
          }),
          children: trigger,
        })
      ) : (
        <Button
          variant="ghost"
          type="button"
          ref={refs.setReference}
          className={className}
          {...getReferenceProps({
            'aria-label': `${label} details`,
            // A hover popup dismissed with Escape may not have focused its
            // trigger. Explicit keyboard re-entry must still reopen it, even
            // while Floating UI suppresses focus restored by dismissal.
            onKeyUp: (event) => {
              if (event.key === 'Tab') setOpen(true)
            },
          })}
        >
          {trigger}
        </Button>
      )}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager
            context={context}
            modal={false}
            initialFocus={-1}
          >
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className={styles.popover}
              {...getFloatingProps({
                'aria-label': label,
                onClick: (event) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    event.target instanceof Element &&
                    event.target.closest('a[href]')
                  ) {
                    setOpen(false)
                  }
                },
              })}
            >
              <strong className={styles.title}>{label}</strong>
              {children}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
