import styles from './beta-notice.module.css'

export function BetaNotice() {
  return (
    <section className={styles.notice} aria-label="Starting open beta">
      <strong>Starting open beta</strong>
      <p>The game is incomplete, with more content to come.</p>
      <p>
        We reserve the right to reset the universe and its progress before full
        public launch.
      </p>
    </section>
  )
}
