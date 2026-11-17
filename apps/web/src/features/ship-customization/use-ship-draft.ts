import { useEffect, useRef, useState } from 'react'
import { commandId } from '../../adapters/command-id'
import type {
  ShipAppearanceAction,
  ShipAppearanceState,
  ShipDesign,
} from '../../client-model/ship-appearance-types'
import {
  acknowledgeSave,
  hasUnsavedDraft,
  initialDraft,
  sameDesign,
  savePayload,
  type ShipDraft,
} from './model'

export function useShipDraft({
  state,
  target,
  perform,
  errorMessage,
}: {
  state: ShipAppearanceState | null
  target: string
  perform: (action: ShipAppearanceAction) => Promise<boolean>
  errorMessage: () => string
}) {
  // Only explicit selections and edits are local; fresh observations never replace them.
  const [edits, setEdits] = useState<ShipDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const running = useRef(false)
  const feedbackAction = useRef<symbol | null>(null)
  const saved = useRef<{
    design: ShipDesign
    selectedRevision: number
    feedbackAction: symbol
  } | null>(null)
  const draft = edits ?? (state ? initialDraft(state, target) : null)
  const equipment = state?.equipment.find((item) => item.target === target)

  useEffect(() => {
    const pending = saved.current
    if (!pending || !state) return
    const submitted = pending.design
    const observed = state.library.find(
      (item) =>
        item.id === submitted.id &&
        item.revision > submitted.revision &&
        sameDesign(item, submitted),
    )
    if (!observed) return
    saved.current = null
    if (feedbackAction.current === pending.feedbackAction) {
      setError('')
      setNotice(
        `“${submitted.name}” is saved. Your fleet appearance will update when its artwork is ready.`,
      )
    }
    // Advance only our successful save's revision token, preserving subsequent edits.
    setEdits((current) =>
      acknowledgeSave(
        current,
        submitted,
        state.library,
        pending.selectedRevision,
      ),
    )
  }, [state])

  function edit(patch: Partial<ShipDraft>) {
    if (!draft) return
    setEdits({ ...draft, ...patch })
    setNotice('')
  }

  function choose(design: ShipDesign) {
    setEdits(design)
    setNotice('')
    setError('')
  }

  async function run(
    action: ShipAppearanceAction,
    success: string,
    submission?: { design: ShipDesign; selectedRevision: number },
  ): Promise<boolean> {
    if (running.current) return false
    running.current = true
    const actionIdentity = Symbol(action.type)
    feedbackAction.current = actionIdentity
    if (submission)
      saved.current = { ...submission, feedbackAction: actionIdentity }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const ok = await perform(action)
      if (ok) setNotice(success)
      else
        setError(
          errorMessage() ||
            'The change could not be confirmed. Your edits are still here. Refresh the status before trying again.',
        )
      return ok
    } catch {
      setError(
        'The hangar could not connect. Your edits are still here. Refresh the status before trying again.',
      )
      return false
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  async function save() {
    if (!draft || !state || running.current) return
    const action = savePayload(draft, state, draft.id || commandId(crypto))
    // The selected revision describes this empire's recipe, not the account head.
    setEdits({ ...action.design, revision: draft.revision })
    await run(
      action,
      'Design saved. Your fleet appearance will update when its artwork is ready.',
      { design: action.design, selectedRevision: draft.revision },
    )
    // An uncertain response may be confirmed by a later reload; retain its token.
  }

  return {
    draft,
    equipment,
    edit,
    choose,
    save,
    run,
    busy,
    notice,
    error,
    hasUnsavedChanges: hasUnsavedDraft(state, edits),
  }
}
