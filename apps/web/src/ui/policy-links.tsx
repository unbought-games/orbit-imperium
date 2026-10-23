import styles from './policy-links.module.css'

export function PolicyLinks() {
  return (
    <nav className={styles.links} aria-label="Policies and support">
      <a href="https://unbought.games/terms/">Terms</a>
      <a href="https://unbought.games/privacy/">Privacy</a>
      <a href="https://unbought.games/conduct/">Conduct</a>
      <a href="mailto:support@unbought.games">Support</a>
    </nav>
  )
}
