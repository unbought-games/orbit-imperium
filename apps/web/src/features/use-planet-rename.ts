import { useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { BoundView } from '../client-model/commands'
import { actionMessage } from '../ui/action-announcements'
import {
  pendingPlanetRename,
  planetNameError,
  trimmedPlanetName,
} from './planet-name'

export function usePlanetRename(
  model: Coordinator,
  body: BoundView['bodies'][number],
) {
  const [draft, setDraft] = useState<string | null>(null)
  const [commandId, setCommandId] = useState<string>()
  const state = useStore(model.store)
  const pending = pendingPlanetRename(state.attempts.values(), body.id)
  const submitted = [...state.attempts.values()].find(
    (a) => a.envelope.command_id === commandId,
  )
  const error = draft === null ? '' : planetNameError(draft)
  const status = pending
    ? actionMessage(pending)
    : submitted?.status === 'rejected'
      ? actionMessage(submitted)
      : submitted?.status === 'committed' && submitted.reconciled
        ? 'Planet renamed.'
        : ''
  return {
    saved: submitted?.status === 'committed' && submitted.reconciled,
    draft,
    setDraft,
    error,
    status,
    canSave:
      draft !== null &&
      !error &&
      !pending &&
      model.ready &&
      trimmedPlanetName(draft) !== body.name,
    edit: () => {
      setDraft(body.name ?? '')
      setCommandId(undefined)
    },
    cancel: () => setDraft(null),
    save: async () => {
      if (draft === null || planetNameError(draft) || pending) return
      const id = await model.send({
        type: 'World',
        action: {
          type: 'RenamePlanet',
          body: body.id,
          name: trimmedPlanetName(draft),
        },
      })
      setCommandId(id)
    },
  }
}
