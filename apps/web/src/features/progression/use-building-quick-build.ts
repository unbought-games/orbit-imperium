import { buildingProgress } from '../../client-model/building-progress'
import { pending } from './shared'
import type { ProgressionProps } from './shared'
import { progressionCommand, type ProgressionRequest } from './options'
import { useProgressionOptions } from './use-progression-options'

export function useBuildingQuickBuild({
  model,
  view,
  request,
  unavailable,
}: {
  model: ProgressionProps['coordinator']
  view: ProgressionProps['view']
  request: Extract<ProgressionRequest, { type: 'Upgrade' }>
  unavailable: string
}) {
  const work = buildingProgress(model.store.getState(), request.body)
  // Cost-only queries remain reusable while work is active. Command eligibility
  // must be inspected again after confirmed completion or cancellation.
  const inspection = useProgressionOptions(
    model,
    view,
    unavailable || work ? null : request,
  )
  const command = progressionCommand(inspection.proposal)
  const reason = unavailable
    ? unavailable
    : work
      ? 'Construction already in progress'
      : inspection.loading
        ? 'Loading build details…'
        : inspection.error
          ? inspection.error
          : command && pending(model, command)
            ? 'Waiting for a pending command'
            : inspection.proposal?.blockers.length
              ? 'Build requirements not met'
              : !command
                ? 'Construction is unavailable'
                : ''
  return {
    ...inspection,
    reason,
    submit: () => {
      // send rechecks the live store and records the intent synchronously before
      // its first await, fencing both rapid clicks and competing row actions.
      if (!reason && command && inspection.proposal)
        void model.send(command, inspection.proposal)
    },
  }
}
