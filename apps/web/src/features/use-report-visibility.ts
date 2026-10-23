import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { actionMessage } from '../ui/action-announcements'
import { pendingReportVisibility } from './report-visibility'

export function useReportVisibility(model: Coordinator, report: string) {
  const [commandId, setCommandId] = useState<string>()
  const state = useStore(model.store)
  const pending = pendingReportVisibility(state.attempts.values(), report)
  const submitted = [...state.attempts.values()].find(
    (attempt) => attempt.envelope.command_id === commandId,
  )
  return {
    disabled: !state.ready || !!pending,
    status: pending
      ? actionMessage(pending)
      : submitted?.status === 'rejected'
        ? actionMessage(submitted)
        : '',
    change: async (hidden: boolean) => {
      if (!state.ready || pending) return
      setCommandId(
        await model.send({
          type: 'World',
          action: { type: 'SetReportHidden', report, hidden },
        }),
      )
    },
  }
}
