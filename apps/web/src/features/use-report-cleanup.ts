import { useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { deleteReportSelection } from './report-cleanup'
type Header = components['schemas']['ReportHeader4']
export function useReportCleanup(
  model: Coordinator,
  clearSelection: () => void,
) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  async function remove(rows: Header[]) {
    if (submitting) return
    setSubmitting(true)
    setError('')
    try {
      await deleteReportSelection(
        model,
        rows.map((row) => row.id),
      )
      clearSelection()
    } catch {
      setError(
        'Cleanup stopped. Unconfirmed reports remain available; check action status and try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }
  return { submitting, error, remove }
}
