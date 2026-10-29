import type { ComponentPropsWithoutRef } from 'react'
import { classes } from './classes'
import styles from './content-column.module.css'

/** Shared page width: focused forms opt in; mobile always uses available space. */
export function ContentColumn({
  as: Element = 'div',
  width = 'full',
  className,
  ...props
}: ComponentPropsWithoutRef<'div'> & {
  as?: 'div' | 'main' | 'section'
  width?: 'full' | 'focused'
}) {
  return (
    <Element
      {...props}
      className={classes(
        styles.column,
        width === 'focused' && styles.focused,
        className,
      )}
    />
  )
}
