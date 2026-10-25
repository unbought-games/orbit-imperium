import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Button } from './button'
import styles from './confirmation-button.module.css'

/** Native modal confirmation; the caller rechecks live eligibility on confirmation. */
export function ConfirmationButton({
  dialogTitle,
  review,
  confirmLabel,
  cancelLabel = 'Keep it',
  onConfirm,
  requiresConfirmation = () => true,
  children,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  dialogTitle: string
  review: ReactNode
  confirmLabel: string
  cancelLabel?: string
  requiresConfirmation?: () => boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const keep = useRef<HTMLButtonElement>(null)
  const titleId = useId(),
    descriptionId = useId()
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      keep.current?.focus()
    }
  }, [open])
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
            onClose={() => {
              setOpen(false)
              if (opener.current?.isConnected && !opener.current.disabled)
                opener.current.focus({ preventScroll: true })
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
                onClick={() => dialog.current?.close()}
              >
                {cancelLabel}
              </Button>
              <Button
                variant="destructive"
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return
                  dialog.current?.close()
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
