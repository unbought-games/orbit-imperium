import { useRef, useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'

export function useMarkShownReportsRead(model: Coordinator, reports: string[]) {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function markShownRead() {
    if (running.current || !reports.length) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      await model.markReportsRead(reports)
    } catch {
      setError('Could not confirm the read change. Please try again.')
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return {
    busy,
    disabled: busy || !reports.length,
    error,
    feedback: busy ? 'Marking shown reports as read…' : '',
    markShownRead,
  }
}
