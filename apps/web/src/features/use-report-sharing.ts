import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import {
  acceptReportSharing,
  reportShareStatus,
} from '../client-model/report-sharing-state'
import { bindingKey } from '../client-model/commands'
import { reportSharing, type ShareAction } from '../adapters/report-sharing'
export function useReportSharing(
  model: Coordinator,
  csrf: string,
  report: string,
) {
  const binding = useStore(model.store, (s) => s.binding)
  const scope = binding ? `${bindingKey(binding)}:${report}` : ''
  const status = useStore(model.store, (s) =>
    reportShareStatus(s, scope, report),
  )
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
      if (!currentBinding || bindingKey(currentBinding) !== bindingKey(binding))
        return
      // A successful publication protects the report even if this dialog closed.
      // Merge its complete header and link together at their server revision.
      const accepted = acceptReportSharing(
        model.store.getState(),
        scope,
        report,
        result,
      )
      if (!accepted) throw new Error('Sharing response was superseded')
      model.store.setState(accepted)
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
