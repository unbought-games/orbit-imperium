import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import {
  observeReportVisibilityCommit,
  pendingReportVisibility,
} from './report-visibility'

export function useReportVisibility(
  model: Coordinator,
  report: string,
  onCommitted?: (hidden: boolean) => void,
) {
  const observation = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => observation.current?.(), [model, report])
  const state = useStore(model.store)
  const pending = pendingReportVisibility(state.attempts.values(), report)
  return {
    disabled: !state.ready || !!pending,
    change: async (hidden: boolean) => {
      if (!state.ready || pending) return
      observation.current?.()
      const stop = onCommitted
        ? observeReportVisibilityCommit(model.store, report, hidden, () =>
            onCommitted(hidden),
          )
        : undefined
      observation.current = stop
      try {
        const submitted = await model.send({
          type: 'World',
          action: { type: 'SetReportHidden', report, hidden },
        })
        if (!submitted) stop?.()
      } catch {
        // The command ledger/banner owns failure and durable recovery.
        stop?.()
      }
    },
  }
}
