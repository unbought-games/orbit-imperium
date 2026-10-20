import { createLink } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './link.module.css'
function LinkAnchor({ className, ...props }: ComponentPropsWithRef<'a'>) {
  return <a className={classes(styles.link, className)} {...props} />
}

export const Link = createLink(LinkAnchor)
