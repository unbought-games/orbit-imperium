import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button } from '../../ui/button'
import styles from './presentation.module.css'
export function PresentationPreview({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId()
  useEffect(() => {
    const node = dialog.current
    if (!open || !node) return
    const previous = document.activeElement
    node.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      node.close()
      document.body.style.overflow = overflow
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus()
    }
  }, [open])
  return createPortal(
    <dialog
      ref={dialog}
      className={styles.previewDialog}
      aria-labelledby={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClose={() => {
        if (open) onClose()
      }}
    >
      <div className={styles.previewBar}>
        <h2 id={title}>Preview · unsaved changes</h2>
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label="Close preview"
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>
      {open && children}
    </dialog>,
    document.body,
  )
}
