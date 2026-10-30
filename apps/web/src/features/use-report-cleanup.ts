import { useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { changeReportSelection } from './report-cleanup'
type Header = components['schemas']['ReportHeader4']
export function useReportCleanup(
  model: Coordinator,
  clearSelection: () => void,
) {
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<'cooldown' | 'other' | null>(null)
  async function remove(rows: Header[], hidden = true) {
    if (submitting) return
    setSubmitting(true)
    setFailure(null)
    try {
      await changeReportSelection(
        model,
        rows.map((row) => row.id),
        hidden,
      )
      clearSelection()
    } catch {
      setFailure(model.store.getState().rateLimited ? 'cooldown' : 'other')
    } finally {
      setSubmitting(false)
    }
  }
  const state = model.store.getState()
  const coolingDown = state.now < state.retryAt
  const error =
    failure === 'cooldown'
      ? coolingDown || state.stale
        ? ''
        : 'Cooldown over. Retry the remaining selected reports when you’re ready.'
      : failure === 'other'
        ? 'Cleanup stopped. Check the remaining reports before trying again.'
        : ''
  return { submitting, error, remove, coolingDown }
}
