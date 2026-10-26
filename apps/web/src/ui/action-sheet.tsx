import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { Button } from './button'
import { Heading } from './typography'
import { classes } from './classes'
import { containSheetFocus } from './action-sheet-focus'
import { SHEET_PAINT_EXTENSION } from './action-sheet-physics'
import { useActionSheet, type ActionSheetOptions } from './use-action-sheet'
import styles from './action-sheet.module.css'

export type ActionSheetControls = {
  snapTo: (percent: number) => void
  close: () => void
}
export type ActionSheetProps = ActionSheetOptions & {
  title: string
  description?: string
  children: ReactNode | ((controls: ActionSheetControls) => ReactNode)
  className?: string
  contentClassName?: string
}

/** Keep mounted while open changes, so the exit can finish before releasing modality. */
export function ActionSheet({
  title,
  description,
  children,
  className,
  contentClassName,
  ...options
}: ActionSheetProps) {
  const sheet = useActionSheet(options)
  const titleId = useId(),
    descriptionId = useId(),
    helpId = useId()
  return createPortal(
    <dialog
      ref={sheet.dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      style={{
        height: sheet.viewport.height,
        width: sheet.viewport.width,
        top: sheet.viewport.top,
        left: sheet.viewport.left,
      }}
      onKeyDown={containSheetFocus}
      onCancel={(event) => {
        event.preventDefault()
        sheet.close()
      }}
      onClose={(event) => {
        if (options.open && !event.currentTarget.open) sheet.close()
      }}
    >
      <motion.div
        className={styles.backdrop}
        style={{ opacity: sheet.opacity }}
        aria-hidden="true"
        onClick={sheet.close}
      />
      <motion.section
        className={classes(styles.sheet, className)}
        aria-label={`${title} sheet`}
        style={{
          y: sheet.y,
          height: sheet.maxHeight + SHEET_PAINT_EXTENSION,
          x: '-50%',
        }}
        drag="y"
        dragListener={false}
        dragControls={sheet.controls}
        dragConstraints={{ top: 0, bottom: sheet.maxHeight + 10 }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={sheet.release}
      >
        <div className={styles.handleRow}>
          <button
            type="button"
            ref={sheet.handle}
            className={styles.handle}
            aria-label="Resize action sheet"
            aria-describedby={helpId}
            onPointerDown={sheet.startDrag}
            onKeyDown={sheet.keyHandle}
          >
            <span />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={styles.close}
            aria-label="Dismiss sheet"
            onClick={sheet.close}
          >
            <X size={20} aria-hidden="true" />
          </Button>
        </div>
        <span className={styles.srOnly} id={helpId}>
          Drag to resize. Arrow keys change height; Home selects the smallest
          stop and End the largest. Escape closes.
        </span>
        <motion.div
          ref={sheet.scroll}
          className={classes(styles.content, contentClassName)}
          style={{ height: sheet.visibleHeight }}
          onFocusCapture={sheet.focusContent}
        >
          <header className={styles.heading}>
            <Heading level={2} id={titleId}>
              {title}
            </Heading>
            {description && <p id={descriptionId}>{description}</p>}
          </header>
          {typeof children === 'function'
            ? children({ snapTo: sheet.snapTo, close: sheet.close })
            : children}
        </motion.div>
      </motion.section>
    </dialog>,
    document.body,
  )
}

/** Optional viewport-sized page surface for bottom-anchored background recession. */
export function ActionSheetSurface({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.surface, className)} {...props} />
}
