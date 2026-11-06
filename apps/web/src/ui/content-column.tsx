import type { ComponentPropsWithoutRef } from 'react'
import { classes } from './classes'
import styles from './content-column.module.css'

/** Shared page widths; mobile always uses the available space. */
export function ContentColumn({
  as: Element = 'div',
  width = 'full',
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'main' | 'section'
  width?: 'full' | 'focused' | 'reading'
}) {
  return (
    <Element
      {...props}
      className={classes(
        styles.column,
        width === 'focused' && styles.focused,
        width === 'reading' && styles.reading,
        className,
      )}
    />
  )
}
