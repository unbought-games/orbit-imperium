import styles from './skip-link.module.css'
export function SkipLink() {
  return (
    <a
      className={styles.link}
      href="#main"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}
    >
      Skip to main content
    </a>
  )
}
