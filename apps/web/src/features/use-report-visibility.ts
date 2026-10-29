import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { pendingReportVisibility } from './report-visibility'

export function useReportVisibility(model: Coordinator, report: string) {
  const state = useStore(model.store)
  const pending = pendingReportVisibility(state.attempts.values(), report)
  return {
    disabled: !state.ready || !!pending,
    change: async (hidden: boolean) => {
      if (!state.ready || pending) return
      await model.send({
        type: 'World',
        action: { type: 'SetReportHidden', report, hidden },
      })
    },
  }
}
