import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import styles from './community-link.module.css'

export function CommunityLink({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <a className={styles.link} href={href}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.copy}>
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
      <ArrowUpRight className={styles.arrow} size={20} aria-hidden="true" />
    </a>
  )
}
