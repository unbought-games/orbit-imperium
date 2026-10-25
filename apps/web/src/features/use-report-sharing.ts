import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { bindingKey } from '../client-model/commands'
import { reportSharing, type ShareAction } from '../adapters/report-sharing'
export function useReportSharing(
  model: Coordinator,
  csrf: string,
  report: string,
) {
  const binding = useStore(model.store, (s) => s.binding)
  const scope = binding ? `${bindingKey(binding)}:${report}` : ''
  const status = useStore(model.store, (s) => s.reportShares?.[scope])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  async function act(action: ShareAction) {
    if (!binding) return
    const request = ++sequence.current
    setBusy(true)
    setError('')
    try {
      const result = await reportSharing(binding, csrf, report, action)
      const currentBinding = model.store.getState().binding
      if (
        request !== sequence.current ||
        !currentBinding ||
        bindingKey(currentBinding) !== bindingKey(binding)
      )
        return
      model.store.setState((s) => ({
        reportShares: { ...s.reportShares, [scope]: result },
      }))
    } catch {
      if (request === sequence.current)
        setError(
          'Unable to confirm sharing status. Retry before sending a link.',
        )
    } finally {
      if (request === sequence.current) setBusy(false)
    }
  }
  useEffect(() => {
    void act({ type: 'Status' })
    return () => {
      sequence.current++
    }
  }, [model, csrf, scope])
  return { status, busy, error, act }
}
