import { useState } from 'react'
import { useStore } from 'zustand'
import { quickBuildFeedback, type BuildGesture } from './quick-build-feedback'
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
  const state = useStore(model.store)
  const [gesture, setGesture] = useState<BuildGesture | null>(null)
  const feedback = quickBuildFeedback(
    state,
    {
      body: request.body,
      item: { kind: 'Building', id: request.building },
    },
    gesture,
  )
  const work = buildingProgress(state, request.body)
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
    feedback,
    recover: () => {
      if (feedback.recoveryId) void model.recover(feedback.recoveryId)
    },
    submit: () => {
      // send rechecks the live store and records the intent synchronously before
      // its first await, fencing both rapid clicks and competing row actions.
      if (
        !reason &&
        feedback.phase === 'hammer' &&
        command &&
        inspection.proposal
      ) {
        const before = model.store.getState().attempts
        void model.send(command, inspection.proposal)
        const after = model.store.getState()
        const key = [...after.attempts.keys()].find((key) => !before.has(key))
        if (key) setGesture({ key, at: after.now })
      }
    },
  }
}
