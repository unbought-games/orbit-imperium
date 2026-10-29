import {
  preferenceReports,
  reportPreference,
} from '../client-model/report-state'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { actionMessage } from '../ui/action-announcements'
import { pendingReportVisibility } from './report-visibility'

export function useReportVisibility(model: Coordinator, report: string) {
  const state = useStore(model.store)
  const pending = pendingReportVisibility(state.attempts.values(), report)
  const submitted = [...state.attempts.values()].reverse().find((attempt) => {
    const action = reportPreference(attempt.envelope.command)
    return (
      action &&
      (action.type === 'SetReportHidden' ||
        action.type === 'SetReportsHidden') &&
      preferenceReports(action).includes(report)
    )
  })
  return {
    disabled: !state.ready || !!pending,
    status:
      submitted?.status === 'rejected' || submitted?.status === 'uncertain'
        ? actionMessage(submitted)
        : '',
    change: async (hidden: boolean) => {
      if (!state.ready || pending) return
      await model.send({
        type: 'World',
        action: { type: 'SetReportHidden', report, hidden },
      })
    },
  }
}
