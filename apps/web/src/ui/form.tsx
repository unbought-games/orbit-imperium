import { ChevronDown } from 'lucide-react'
import { useRef, type ClipboardEvent, type ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './form.module.css'
export function Form({ className, ...props }: ComponentPropsWithRef<'form'>) {
  return <form className={classes(styles.form, className)} {...props} />
}
export function Field({ className, ...props }: ComponentPropsWithRef<'label'>) {
  return <label className={classes(styles.field, className)} {...props} />
}
export function Input({ className, ...props }: ComponentPropsWithRef<'input'>) {
  return <input className={classes(styles.control, className)} {...props} />
}
export function Textarea({
  className,
  ...props
}: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={classes(styles.control, className)} {...props} />
}
/** Compose leading/trailing accessories around an input, sharing one control frame. */
export function InputGroup({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={classes(styles.control, styles.inputGroup, className)}
      {...props}
    />
  )
}
export function InputAccessory({
  className,
  ...props
}: ComponentPropsWithRef<'span'>) {
  return (
    <span className={classes(styles.inputAccessory, className)} {...props} />
  )
}

function pasteQuantityWithoutCommas(event: ClipboardEvent<HTMLInputElement>) {
  const input = event.currentTarget
  const text = event.clipboardData.getData('text/plain')
  if (!text.includes(',')) return

  // Use the native edit so selection, undo and the caller's input events
  // behave the same as when the player types digits.
  if (
    input.ownerDocument.execCommand(
      'insertText',
      false,
      text.replaceAll(',', ''),
    )
  )
    event.preventDefault()
}

// Keep text selection and exact string values, with a numeric keyboard on mobile.
export function NumberInput({
  stripPastedCommas = true,
  onPaste,
  onFocus,
  onPointerDown,
  onClick,
  ...props
}: Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  stripPastedCommas?: boolean
}) {
  const selectOnClick = useRef(false)
  return (
    <Input
      inputMode="numeric"
      {...props}
      type="text"
      onPaste={(event) => {
        onPaste?.(event)
        if (stripPastedCommas && !event.defaultPrevented)
          pasteQuantityWithoutCommas(event)
      }}
      onFocus={(event) => {
        event.currentTarget.select()
        onFocus?.(event)
      }}
      onPointerDown={(event) => {
        selectOnClick.current =
          event.currentTarget.ownerDocument.activeElement !==
          event.currentTarget
        onPointerDown?.(event)
      }}
      onClick={(event) => {
        // Safari places the caret after focus; restore selection only for the
        // click that entered the field, so subsequent clicks can move the caret.
        if (selectOnClick.current) {
          const input = event.currentTarget
          const value = input.value
          input.select()
          requestAnimationFrame(() => {
            if (
              input.ownerDocument.activeElement === input &&
              input.value === value
            )
              input.select()
          })
        }
        selectOnClick.current = false
        onClick?.(event)
      }}
    />
  )
}
export function Select({
  className,
  ...props
}: ComponentPropsWithRef<'select'>) {
  // Listboxes keep native presentation; the single-value control gets a
  // decorative arrow while retaining its native keyboard and mobile picker.
  const dropdown =
    !props.multiple && (props.size === undefined || props.size <= 1)
  const control = (
    <select
      className={classes(styles.control, dropdown && styles.select, className)}
      {...props}
    />
  )
  return dropdown ? (
    <span className={styles.selectWrap}>
      {control}
      <ChevronDown
        className={styles.selectChevron}
        size={16}
        aria-hidden="true"
      />
    </span>
  ) : (
    control
  )
}
export function FormGrid({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.grid, className)} {...props} />
}

export function RangeInput({
  className,
  ...props
}: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="range"
      className={classes(styles.range, className)}
    />
  )
}
