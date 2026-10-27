import type { GameState } from '../../client-model/game-store'
import { buildingProgress } from '../../client-model/building-progress'
import {
  latestProgressionAttempt,
  type ActionTarget,
} from './action-feedback-model'
import { actionMessage } from '../../ui/action-announcements'

/** Local interaction identity and animation start; game results stay in the store. */
export type BuildGesture = { key: string; at: number }
export const BUILD_ACKNOWLEDGMENT_MS = 3000

export function quickBuildFeedback(
  state: GameState,
  target: ActionTarget,
  gesture: BuildGesture | null,
) {
  const latest = latestProgressionAttempt(state.attempts, target)
  const submitted = gesture ? state.attempts.get(gesture.key) : undefined
  const progress = buildingProgress(state, target.body)
  const work = progress?.building === target.item.id ? progress : null
  const problem = latest?.status === 'rejected' ? actionMessage(latest) : ''
  const uncertain = latest?.status === 'uncertain'
  const acknowledging = !!(
    gesture &&
    submitted &&
    submitted === latest &&
    submitted.status !== 'rejected' &&
    submitted.status !== 'uncertain' &&
    state.now - gesture.at < BUILD_ACKNOWLEDGMENT_MS
  )
  const phase = uncertain
    ? 'uncertain'
    : acknowledging
      ? 'check'
      : work
        ? work.status === 'In progress' && work.secondsRemaining !== null
          ? 'countdown'
          : 'pending'
        : 'hammer'
  return {
    phase,
    problem,
    work,
    recoveryId: uncertain ? latest.envelope.command_id : null,
    status:
      phase === 'check'
        ? work?.status === 'In progress'
          ? 'Construction started'
          : 'Build requested; confirming'
        : phase === 'uncertain'
          ? 'Build confirmation delayed. Check status.'
          : work?.secondsRemaining === null
            ? 'Checking completion'
            : (work?.status ?? ''),
  }
}
