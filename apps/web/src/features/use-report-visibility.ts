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
      let active = true
      let stop: (() => void) | undefined
      const cancel = () => {
        active = false
        stop?.()
      }
      observation.current = cancel
      try {
        const submitted = await model.send(
          {
            type: 'World',
            action: { type: 'SetReportHidden', report, hidden },
          },
          undefined,
          (key) => {
            if (active && onCommitted)
              stop = observeReportVisibilityCommit(model.store, key, () =>
                onCommitted(hidden),
              )
          },
        )
        if (!submitted) cancel()
      } catch {
        // The command ledger/banner owns failure and durable recovery.
        cancel()
      }
    },
  }
}
