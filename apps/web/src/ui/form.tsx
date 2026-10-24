import { useRef, type ComponentPropsWithRef } from 'react'
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
// Keep text selection and exact string values, with a numeric keyboard on mobile.
export function NumberInput({
  onFocus,
  onPointerDown,
  onClick,
  ...props
}: Omit<ComponentPropsWithRef<'input'>, 'type'>) {
  const selectOnClick = useRef(false)
  return (
    <Input
      inputMode="numeric"
      {...props}
      type="text"
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
  return <select className={classes(styles.control, className)} {...props} />
}
export function FormGrid({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.grid, className)} {...props} />
}
