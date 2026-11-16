import {
  useId,
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'
import { Button } from './button'
import { AnchoredPopover } from './anchored-popover'
import { classes } from './classes'
import { usePopupFocusReturn } from './use-popup-focus-return'
import styles from './popover.module.css'

type Side = 'top' | 'bottom' | 'left' | 'right'
type Placement = Side | `${Side}-${'start' | 'end'}`

/** Read-only details, available with a mouse, keyboard, or touch. */
export function Popover({
  label,
  trigger,
  children,
  className,
  link,
  surfaceClassName,
  showTitle = true,
  placement = 'bottom',
  triggerRef,
  triggerDescription,
}: {
  label: string
  trigger: ReactNode
  children: ReactNode
  className?: string
  triggerDescription?: string
  triggerRef?: Ref<HTMLElement>
  surfaceClassName?: string
  showTitle?: boolean
  placement?: Placement
  link?: ReactElement<ComponentPropsWithRef<'a'>>
}) {
  const id = useId()
  const descriptionId = useId()
  const popupId = useId()
  const anchor = useRef<HTMLElement>(null)
  const referenceRef = useCallback(
    (element: HTMLElement | null) => {
      anchor.current = element
      if (typeof triggerRef === 'function') {
        const cleanup = triggerRef(element)
        if (cleanup)
          return () => {
            anchor.current = null
            cleanup()
          }
      } else if (triggerRef) triggerRef.current = element
    },
    [triggerRef],
  )
  const popup = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const popupRef = usePopupFocusReturn(open, popup, anchor)
  const suppressRestoredFocus = useRef(false)
  const changeOpen = (next: boolean) => {
    suppressRestoredFocus.current = !next
    setOpen(next)
  }
  const [side, align = 'center'] = placement.split('-') as [
    Side,
    'start' | 'end' | 'center',
  ]
  return (
    <AnchoredPopover.Root open={open} triggerId={id} onOpenChange={changeOpen}>
      <AnchoredPopover.Trigger
        id={id}
        ref={referenceRef}
        nativeButton={!link}
        openOnHover
        delay={150}
        className={className}
        aria-label={
          link ? (link.props['aria-label'] ?? label) : `${label} details`
        }
        aria-describedby={
          [
            triggerDescription ? descriptionId : null,
            link && open ? popupId : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
        aria-haspopup={link ? undefined : 'dialog'}
        aria-expanded={link ? undefined : open}
        role={link ? 'link' : undefined}
        render={link ?? <Button variant="ghost" type="button" />}
        onFocus={(event) => {
          if (
            !suppressRestoredFocus.current &&
            event.currentTarget.matches(':focus-visible') &&
            !(
              event.relatedTarget instanceof Node &&
              popup.current?.contains(event.relatedTarget)
            )
          )
            setOpen(true)
        }}
        onBlur={() => {
          suppressRestoredFocus.current = false
        }}
        onKeyUp={(event) => {
          if (event.key === 'Tab') changeOpen(true)
        }}
        onClick={(event) => {
          // A link still navigates, including modified clicks. Only suppress the
          // popover's button behavior, not the browser's default action.
          if (link) event.preventBaseUIHandler()
        }}
        data-touch-control={link ? '' : undefined}
      >
        {trigger}
      </AnchoredPopover.Trigger>
      {triggerDescription && (
        <span id={descriptionId} hidden>
          {triggerDescription}
        </span>
      )}
      {open && (
        <AnchoredPopover.Content
          ref={popupRef}
          id={popupId}
          initialFocus={false}
          aria-label={label}
          role={link ? 'tooltip' : 'dialog'}
          portalProps={{
            container: anchor.current?.closest('dialog') ?? undefined,
          }}
          positionerProps={{ side, align }}
          className={classes(styles.popover, surfaceClassName)}
          onClick={(event) => {
            if (
              event.button === 0 &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.shiftKey &&
              !event.altKey &&
              event.target instanceof Element &&
              event.target.closest('a[href]')
            )
              changeOpen(false)
          }}
        >
          {showTitle && <strong className={styles.title}>{label}</strong>}
          {children}
        </AnchoredPopover.Content>
      )}
    </AnchoredPopover.Root>
  )
}
