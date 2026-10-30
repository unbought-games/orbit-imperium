import { useRef } from 'react'
import { Star } from 'lucide-react'
import { useStore } from 'zustand'
import { sameBinding } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import { projectedReportHeader } from '../client-model/report-state'
import { ConfirmationButton } from '../ui/confirmation-button'
import { pendingReportVisibility } from './report-visibility'

export function ReportStarButton({
  model,
  report,
  disabled = false,
}: {
  model: Coordinator
  report: string
  disabled?: boolean
}) {
  const state = useStore(model.store)
  const header = projectedReportHeader(
    state.reportHeaders,
    state.attempts.values(),
    report,
  )
  const starred = !!header?.starred
  // Preserve the user's requested value while the confirmation is open.
  const intent = useRef({ report, starred: false, binding: state.binding })
  return (
    <ConfirmationButton
      dialogTitle="Unstar this shared report?"
      review={
        <p>
          Unstarring allows this report to be archived, including by bulk
          cleanup. Archiving keeps its shared link active. Use Stop sharing to
          revoke it.
        </p>
      }
      confirmLabel="Unstar report"
      cancelLabel="Keep starred"
      requiresConfirmation={() => {
        intent.current = { report, starred: !starred, binding: state.binding }
        return starred && !!header?.shared
      }}
      variant="ghost"
      size="icon"
      aria-label={starred ? 'Unstar report' : 'Star report'}
      aria-pressed={starred}
      title={
        starred
          ? 'Protected from archiving. Unstar to allow archiving.'
          : 'Star to protect from archiving'
      }
      disabled={
        disabled ||
        !state.ready ||
        !!pendingReportVisibility(state.attempts.values(), report)
      }
      onConfirm={() => {
        const current = model.store.getState()
        const live = projectedReportHeader(
          current.reportHeaders,
          current.attempts.values(),
          report,
        )
        if (
          !live ||
          intent.current.report !== report ||
          !intent.current.binding ||
          !current.binding ||
          !sameBinding(intent.current.binding, current.binding) ||
          !!live.starred === intent.current.starred ||
          !current.ready ||
          pendingReportVisibility(current.attempts.values(), report)
        )
          return
        void model.send({
          type: 'World',
          action: {
            type: 'SetReportStarred',
            report,
            starred: intent.current.starred,
          },
        })
      }}
    >
      <Star
        size={16}
        aria-hidden="true"
        fill={starred ? 'currentColor' : 'none'}
      />
    </ConfirmationButton>
  )
}
