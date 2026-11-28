import { lazy, Suspense, useState } from 'react'
import { useStore } from 'zustand'
import type { Attempt } from '../client-model/commands'
import { attemptKey } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import { projectGameView } from '../client-model/game-projection'
import { draftFromFleetIntent } from './dispatch-review-session'
import { ActionSheet } from '../ui/action-sheet'
import { Button } from '../ui/button'
const Dispatch = lazy(async () => ({
  default: (await import('./missions')).Dispatch,
}))

// Keep the rejected order's editor separate from the player's next draft.
// Unknown outcomes continue to use the ledger's retry with its original ID.
export function FailedDispatch({
  model,
  attempt,
}: {
  model: Coordinator
  attempt: Attempt
}) {
  const [open, setOpen] = useState(false)
  const state = useStore(model.store)
  const command = attempt.envelope.command
  const submitted = state.intents.get(
    attemptKey(attempt.envelope.binding, attempt.envelope.command_id),
  )
  if (
    attempt.status !== 'rejected' ||
    command.type !== 'World' ||
    command.action.type !== 'LaunchFleet' ||
    !submitted?.dispatchCoordinates
  )
    return null
  const intent = command.action.intent
  const view = open ? projectGameView(state) : state.view
  if (view?.protocol !== 4) return null
  const origin = view.bodies.find((body) => body.id === intent.origin)
  if (!origin) return null
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Prepare fleet again
      </Button>
      {open && (
        <ActionSheet
          open={open}
          onOpenChange={setOpen}
          title="Prepare failed fleet"
          initialSnap={95}
          snapPoints={[95]}
        >
          <Suspense fallback={<p role="status">Opening fleet editor…</p>}>
            <Dispatch
              embedded
              model={model}
              view={view}
              body={origin}
              draft={draftFromFleetIntent(
                intent,
                submitted.dispatchCoordinates,
              )}
            />
          </Suspense>
        </ActionSheet>
      )}
    </>
  )
}
