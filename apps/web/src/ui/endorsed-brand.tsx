import { Link } from './link'
import styles from './endorsed-brand.module.css'

/** One canonical lockup, with independent game and publisher destinations. */
export function EndorsedBrand({ homeLink = true }: { homeLink?: boolean }) {
  return (
    <div className={styles.lockup}>
      <img
        className={styles.art}
        src="/brand-orbit-by-unbought.svg"
        width={417}
        height={100}
        alt=""
      />
      {homeLink ? (
        <Link className={styles.home} to="/" aria-label="Orbit Imperium" />
      ) : (
        <span className={styles.home} role="img" aria-label="Orbit Imperium" />
      )}
      <a
        className={styles.studio}
        href="https://unbought.games/"
        aria-label="by unbought games"
      />
    </div>
  )
}
