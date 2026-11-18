import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { commandId } from '../adapters/command-id'
import { canonical } from '../client-model/commands'
import { dispatchSelection } from '../client-model/dispatch-timing'
import { dispatchFailure } from '../client-model/dispatch-validation'
import type { DispatchDraft } from './missions'

type S = components['schemas']
export type ReviewedFleet = {
  id: string
  editor: string
  terms: S['FleetTerms4']
  coordinates: S['Coordinates']
  source: DispatchDraft | null
}

export class DispatchReviewSession {
  readonly id = commandId(crypto)
  private active?: ReviewedFleet
  private preparation?: string

  prepare(autoReview: boolean) {
    this.active = undefined
    const id = commandId(crypto)
    this.preparation = autoReview ? id : undefined
    return id
  }
  enterEditor() {
    this.active = undefined
    this.preparation = undefined
  }
  shouldPrepare(id?: string) {
    return !!id && id === this.preparation
  }
  open(
    editor: string,
    terms: S['FleetTerms4'],
    coordinates: S['Coordinates'],
    source: DispatchDraft | null = null,
  ) {
    this.active = {
      id: commandId(crypto),
      editor,
      terms,
      coordinates,
      source,
    }
    return this.active
  }
  match(id: string | undefined, origin: string) {
    return this.active?.id === id && this.active?.terms.intent.origin === origin
      ? this.active
      : undefined
  }
  retire(id: string) {
    if (this.active?.id === id) this.active = undefined
  }
}

export function reviewedDraft(review: ReviewedFleet): DispatchDraft {
  const { intent } = review.terms
  return {
    mission: intent.mission,
    coordinates: review.coordinates,
    target: intent.destination,
    observedAt: review.source?.observedAt,
    targetKind:
      intent.destination.type === 'Debris'
        ? 'debris'
        : intent.destination.type === 'Body' &&
            intent.destination.expected_kind === 'Moon'
          ? 'moon'
          : 'planet',
    ships: Object.fromEntries(intent.ships.map((s) => [s.ship_type, s.count])),
    speed: intent.speed_percent,
    attackGroup: intent.attack_group ?? undefined,
  }
}

type ReviewReader = Pick<Coordinator, 'refresh' | 'world'> & {
  store: {
    getState: () => Pick<
      ReturnType<Coordinator['store']['getState']>,
      'ready' | 'stale' | 'connectionInterrupted'
    >
  }
}
/** Check the original target, including its identity or revision, before requesting terms. */
export async function revalidateReview(
  model: ReviewReader,
  review: ReviewedFleet,
) {
  await model.refresh()
  const state = model.store.getState()
  if (!state.ready || state.stale || state.connectionInterrupted)
    throw Error('Reconnect and review your fleet again.')
  const { intent } = review.terms
  const destination = intent.destination
  const resolved = await model
    .world(
      destination.type === 'Site'
        ? { type: 'ResolveMissionSite', selection: destination.selection }
        : {
            type: 'ResolveDestination',
            selection: dispatchSelection(
              intent.mission,
              review.coordinates,
              destination.type === 'Body'
                ? destination.expected_kind
                : 'Planet',
            ),
          },
    )
    .catch((error) => {
      throw Error(dispatchFailure(error, intent))
    })
  if (!resolved)
    throw Error('Unable to confirm this destination. Review the fleet again.')
  if (canonical(resolved) !== canonical(destination))
    throw Error(
      'The destination changed. Choose a current target and review your fleet again.',
    )
  const terms = await model
    .world({ type: 'FleetQuote', intent })
    .catch((error) => {
      throw Error(dispatchFailure(error, intent))
    })
  if (
    !terms ||
    !('terms_hash' in terms) ||
    !('slot_limit' in terms) ||
    terms.terms_hash !== review.terms.terms_hash ||
    terms.profile_hash !== review.terms.profile_hash
  )
    throw Error('Fleet terms changed. Review your selections again.')
}
