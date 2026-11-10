import {
  attemptKey,
  canonical,
  type BoundProgressionOptions,
} from '../../client-model/commands'
import type { Coordinator } from '../../client-model/coordinator'
import {
  canSubmitQuote,
  manufacturingPending,
  projectGameView,
} from '../../client-model/game-projection'
import {
  currentProgressionOptions,
  progressionCommand,
  progressionContext,
} from './options'
import type { ProgressionProps } from './shared'
import {
  matchesManufacturingPreview,
  type manufacturingPreview,
} from './manufacturing-preview'

type Preview = ReturnType<typeof manufacturingPreview>
type Model = Pick<Coordinator, 'store' | 'options' | 'send' | 'ready' | 'stale'>
type Snapshot = {
  busy: boolean
  failure: { key: string; message: string } | null
  submitted: { key: string; generation: number } | null
}

export function manufacturingOrderIdentity(
  source: BoundProgressionOptions | null,
  view: ProgressionProps['view'],
  quantity: string,
  preview: Preview,
) {
  return {
    validation: canonical([
      preview?.request,
      source?.terms,
      progressionContext(view),
    ]),
    draft: canonical([view.binding, quantity]),
    error: canonical([view.binding, preview?.request]),
  }
}

export function canBuildManufacturingOrder(
  model: Model,
  preview: Preview,
  busy: boolean,
) {
  return (
    !!preview &&
    !preview.blockers.length &&
    !busy &&
    model.ready &&
    !model.stale &&
    !manufacturingPending(model.store.getState(), preview.request.body)
  )
}

/** Local interaction lifecycle only. Prices, eligibility and receipts remain in
 * the authoritative game store; validation never substitutes for model.send. */
export function createManufacturingOrder(model: Model) {
  let generation = 0
  let draftGeneration = 0
  let snapshot: Snapshot = { busy: false, failure: null, submitted: null }
  const listeners = new Set<() => void>()
  function update(change: Partial<Snapshot>) {
    snapshot = { ...snapshot, ...change }
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    invalidateValidation: () => {
      generation++
    },
    invalidateDraft: () => {
      draftGeneration++
    },
    /** A receipt may commit after send returns (Pending or uncertain recovery).
     * Consume it once, and only clear the draft that was actually submitted. */
    consumeCommitted: () => {
      const submitted = snapshot.submitted
      if (
        !submitted ||
        model.store.getState().attempts.get(submitted.key)?.status !==
          'committed'
      )
        return false
      const reset = submitted.generation === draftGeneration
      update({ submitted: null })
      return reset
    },
    async build(
      preview: Preview,
      binding: BoundProgressionOptions['binding'],
      errorKey: string,
      refresh: () => void,
    ) {
      if (
        !preview ||
        !canBuildManufacturingOrder(model, preview, snapshot.busy)
      )
        return
      const started = generation
      const submittedDraft = draftGeneration
      update({ busy: true, failure: null })
      try {
        const validated = await model.options(preview.request)
        if (generation !== started) return
        if (!validated)
          throw new Error(
            'Unable to build. Check your connection and try again.',
          )
        if (!matchesManufacturingPreview(preview, validated)) {
          refresh()
          throw new Error(
            'Cost or build time changed. Check the updated order and build again.',
          )
        }
        const view = projectGameView(model.store.getState())
        const current =
          view && view.protocol !== 2
            ? currentProgressionOptions(validated, view)
            : null
        // Resource eligibility is derived, not retained as a local failure.
        if (current?.blockers.length) {
          refresh()
          return
        }
        const command = progressionCommand(current)
        if (
          !current ||
          !command ||
          !canSubmitQuote(model.store.getState(), command, current)
        ) {
          throw new Error(
            'This order is no longer available. Check the updated order and try again.',
          )
        }
        const id = await model.send(command, current)
        if (id && submittedDraft === draftGeneration) {
          update({
            submitted: {
              key: attemptKey(binding, id),
              generation: submittedDraft,
            },
          })
        }
      } catch (error) {
        if (generation === started)
          update({
            failure: {
              key: errorKey,
              message:
                error instanceof Error
                  ? error.message
                  : 'Unable to build. Try again.',
            },
          })
      } finally {
        update({ busy: false })
      }
    },
  }
}
