import { useEffect, useState } from 'react'
import { Check, Eye } from 'lucide-react'
import { Button } from '../ui/button'
import styles from './galaxy.module.css'

/** A local click acknowledgement, not a second source of fleet state. */
export function GalaxySpyButton({
  name,
  reason,
  busy,
  paused,
  error,
  onSend,
}: {
  name: string
  reason?: string | null
  busy?: boolean
  paused?: boolean
  error?: string | null
  onSend: () => void
}) {
  const [acknowledgement, setAcknowledgement] = useState(0)
  useEffect(() => {
    if (!acknowledgement) return
    const timer = setTimeout(() => setAcknowledgement(0), 1400)
    return () => clearTimeout(timer)
  }, [acknowledgement])
  const showCheck = acknowledgement > 0 && !error && !paused
  return (
    <Button
      variant="ghost"
      className={styles.spyButton}
      data-feedback={showCheck}
      disabled={!!reason || busy || paused || showCheck}
      title={
        showCheck ? 'Probe requested' : (reason ?? 'Send one espionage probe')
      }
      aria-label={showCheck ? `Probe requested for ${name}` : `Spy on ${name}`}
      aria-busy={busy}
      onClick={() => {
        setAcknowledgement((value) => value + 1)
        onSend()
      }}
    >
      <span className={styles.spyContent} aria-hidden="true">
        <Eye size={17} />
        <span className={styles.actionText}>Spy</span>
      </span>
      <span className={styles.spyCheck} aria-hidden="true">
        <Check size={20} strokeWidth={2.5} />
      </span>
    </Button>
  )
}
