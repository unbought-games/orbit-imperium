import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { Button } from '../ui/button'
import type { DispatchDraft } from './missions'

export function ReportAttackButton({
  model,
  payload,
  observedAt,
  onDraft,
}: {
  model: Coordinator
  payload: components['schemas']['ReportDetail4']['payload']
  observedAt: number
  onDraft: (draft: DispatchDraft) => void
}) {
  const enabled = useStore(model.store, (state) =>
    state.view?.capabilities.some(
      (c) => c.capability === 'Attack' && c.enabled,
    ),
  )
  if (payload.kind !== 'Espionage' || !enabled) return null
  return (
    <Button
      onClick={() =>
        onDraft({
          coordinates: payload.target.coordinates,
          mission: 'Attack',
          target: {
            type: 'Body',
            id: payload.target.body,
            expected_owner: payload.target.owner,
            expected_kind: payload.target.kind,
          },
          observedAt,
        })
      }
    >
      Attack
    </Button>
  )
}
