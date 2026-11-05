import styles from './history.module.css'
import { useState } from 'react'
import { Button } from '../../ui/button'
export function ShareLink({
  path,
  label = 'Copy profile link',
}: {
  path: string
  label?: string
}) {
  const [message, setMessage] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        new URL(path, window.location.origin).href,
      )
      setMessage('Link copied.')
    } catch {
      setMessage('Copy the address from your browser to share this page.')
    }
  }
  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={() => void copy()}>
        {label}
      </Button>
      <span role="status">{message}</span>
    </div>
  )
}
