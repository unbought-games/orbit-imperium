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
  type ShipDraft,
} from './model'

export function useShipDraft({
  state,
  target,
  perform,
}: {
  state: ShipAppearanceState | null
  target: string
  perform: (action: ShipAppearanceAction) => Promise<boolean>
}) {
  // Only explicit selections and edits are local; fresh observations never replace them.
  const [edits, setEdits] = useState<ShipDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const running = useRef(false)
  const saved = useRef<ShipDesign | null>(null)
  const draft = edits ?? (state ? initialDraft(state, target) : null)
  const equipment = state?.equipment.find((item) => item.target === target)

  useEffect(() => {
    const submitted = saved.current
    if (!submitted || !state) return
    const observed = state.library.find(
      (item) =>
        item.id === submitted.id &&
        item.revision > submitted.revision &&
        sameDesign(item, submitted),
    )
    if (!observed) return
    saved.current = null
    // Advance only our successful save's revision token, preserving subsequent edits.
    setEdits((current) => acknowledgeSave(current, submitted, state.library))
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
  ): Promise<boolean> {
    if (running.current) return false
    running.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const ok = await perform(action)
      if (ok) setNotice(success)
      else
        setError(
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
    if (!draft || running.current) return
    const design = {
      ...draft,
      id: draft.id || commandId(crypto),
      name: draft.name.trim(),
    }
    setEdits(design)
    saved.current = design
    await run(
      {
        type: 'Save',
        design,
        equip: true,
        expected_equipment_revision: equipment?.revision ?? 0,
      },
      'Design saved. Your fleet appearance will update when its artwork is ready.',
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
