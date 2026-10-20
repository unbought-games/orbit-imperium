import type { components } from '../contracts'
import {
  sameBinding,
  type BindingCandidate,
  type BoundView,
  type BoundSettings,
} from './commands'
import { validate } from './schema'
export type Bootstrap = components['schemas']['Bootstrap']
export type InitialGameSnapshot = components['schemas']['InitialGameSnapshot']
export type Session = components['schemas']['Session']
export function validateGameData(
  candidate: BindingCandidate,
  view: BoundView,
  settings: BoundSettings,
) {
  if (
    !sameBinding(view.binding, candidate.binding) ||
    !sameBinding(settings.binding, candidate.binding) ||
    view.protocol !== candidate.protocol ||
    settings.protocol !== candidate.protocol ||
    settings.profile_hash !== view.profile_hash ||
    settings.speed !== view.speed
  )
    throw Error('Incompatible game data')
}
export function validateInitialGame(
  session: Session,
  snapshot: InitialGameSnapshot,
): InitialGameSnapshot {
  validate<InitialGameSnapshot>('InitialGameSnapshot', snapshot)
  const { candidate, view, settings, request_id } = snapshot,
    b = candidate.binding
  if (
    session.account !== b.account ||
    !session.memberships.some(
      (m) => m.universe === b.universe && m.player === b.player,
    ) ||
    session.memberships[0]?.universe !== b.universe ||
    [candidate, view, settings].some((v) => v.request_id !== request_id)
  )
    throw Error('Bootstrap identity mismatch')
  validateGameData(candidate, view, settings)
  return snapshot
}
