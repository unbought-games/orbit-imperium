import { useStore } from 'zustand'
import type { Coordinator } from '../../client-model/coordinator'
import {
  productionControlSettings,
  productionAutosave,
} from './production-autosave'

export function useProductionAutosave(model: Coordinator, body: string) {
  const autosave = productionAutosave(model, body)
  const { edits, flight, error } = useStore(autosave.store)
  const game = useStore(model.store)
  const pending = [...game.attempts.values()].filter(
    (attempt) =>
      attempt.envelope.command.type === 'SetProduction' &&
      attempt.envelope.command.body === body &&
      !attempt.reconciled,
  )
  return {
    settings: productionControlSettings(game, body, edits),
    change: autosave.changeDeferred,
    flush: autosave.flush,
    retry: autosave.retry,
    error: game.rateLimited ? null : error,
    status:
      error || pending.some((attempt) => attempt.status === 'uncertain')
        ? ''
        : flight || pending.length || Object.keys(edits).length
          ? 'Saving production changes… Totals show confirmed settings.'
          : 'All changes saved automatically.',
  }
}
