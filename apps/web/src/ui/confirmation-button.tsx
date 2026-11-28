import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Button, type ButtonVariant } from './button'
import styles from './confirmation-button.module.css'

/** Native modal confirmation; the caller rechecks live eligibility on confirmation. */
export function ConfirmationButton({
  triggerRef,
  dialogTitle,
  review,
  confirmLabel,
  confirmVariant = 'destructive',
  cancelLabel = 'Keep it',
  onConfirm,
  requiresConfirmation = () => true,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  triggerRef?: RefObject<HTMLButtonElement | null>
  dialogTitle: string
  review: ReactNode
  confirmLabel: string
  confirmVariant?: ButtonVariant
  cancelLabel?: string
  requiresConfirmation?: () => boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const defaultOpener = useRef<HTMLButtonElement>(null)
  const opener = triggerRef ?? defaultOpener
  const keep = useRef<HTMLButtonElement>(null)
  const titleId = useId(),
    descriptionId = useId()
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      keep.current?.focus()
    }
  }, [open])
  function dismiss() {
    // Native close restores focus immediately but queues its close event. Clear
    // our open state in the same gesture so the trigger can reopen immediately.
    dialog.current?.close()
    setOpen(false)
    if (opener.current?.isConnected && !opener.current.disabled)
      opener.current.focus({ preventScroll: true })
  }
  return (
    <>
      <Button
        {...props}
        type="button"
        disabled={disabled}
        ref={opener}
        onClick={() => {
          if (requiresConfirmation()) setOpen(true)
          else onConfirm()
        }}
      >
        {children}
      </Button>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            className={styles.dialog}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            onCancel={(event) => {
              event.preventDefault()
              dismiss()
            }}
          >
            <h2 id={titleId}>{dialogTitle}</h2>
            <div id={descriptionId} className={styles.review}>
              {review}
            </div>
            {disabled && (
              <p role="status">This action is no longer available.</p>
            )}
            <div className={styles.actions}>
              <Button
                ref={keep}
                variant="secondary"
                type="button"
                onClick={dismiss}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={confirmVariant}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  dismiss()
                  onConfirm()
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </dialog>,
          document.body,
        )}
    </>
  )
}
