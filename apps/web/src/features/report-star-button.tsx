import { Star } from 'lucide-react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { projectedReportHeader } from '../client-model/report-state'
import { Button } from '../ui/button'
import { pendingReportVisibility } from './report-visibility'

export function ReportStarButton({
  model,
  report,
}: {
  model: Coordinator
  report: string
}) {
  const state = useStore(model.store)
  const starred = !!projectedReportHeader(
    state.reportHeaders,
    state.attempts.values(),
    report,
  )?.starred
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={starred ? 'Unstar report' : 'Star report'}
      aria-pressed={starred}
      title={
        starred
          ? 'Protected from deletion. Unstar to allow deletion.'
          : 'Star to protect from deletion'
      }
      disabled={
        !state.ready ||
        !!pendingReportVisibility(state.attempts.values(), report)
      }
      onClick={() =>
        void model.send({
          type: 'World',
          action: { type: 'SetReportStarred', report, starred: !starred },
        })
      }
    >
      <Star
        size={16}
        aria-hidden="true"
        fill={starred ? 'currentColor' : 'none'}
      />
    </Button>
  )
}
