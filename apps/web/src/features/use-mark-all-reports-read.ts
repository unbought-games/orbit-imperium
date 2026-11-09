import { useRef, useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import { markAllReportsRead } from './mark-all-reports-read'

export function useMarkAllReportsRead(model: Coordinator) {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  async function markAllRead() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    setFeedback('Loading all reports…')
    try {
      await markAllReportsRead(model)
      setFeedback('All reports marked as read.')
    } catch {
      setFeedback('')
      setError(
        'Could not mark all reports as read. Try Mark all as read again.',
      )
    } finally {
      running.current = false
      setBusy(false)
    }
  }
  return { busy, error, feedback, markAllRead }
}
