import { createElement, type ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './panel.module.css'
type PanelProps = ComponentPropsWithRef<'section'> & {
  as?: 'article' | 'section' | 'div'
  tone?: 'default' | 'accent'
  density?: 'normal' | 'compact' | 'log'
}
export function Panel({
  as = 'article',
  tone = 'default',
  density = 'normal',
  className,
  ...props
}: PanelProps) {
  return createElement(as, {
    ...props,
    className: classes(styles.panel, styles[tone], styles[density], className),
  })
}
