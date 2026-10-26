import styles from './beta-notice.module.css'

export function BetaNotice() {
  return (
    <section className={styles.notice} aria-label="Open Beta">
      <strong>Open Beta</strong>
      <p>
        We’re actively building Orbit Imperium. Expect new features and changes
        as we go.
      </p>
    </section>
  )
}
