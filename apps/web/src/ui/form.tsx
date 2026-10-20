import type { ComponentPropsWithRef } from 'react'
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
