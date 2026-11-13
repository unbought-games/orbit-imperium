import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { bindingKey } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { matchingResourceObservation } from './dispatch-loot-model'
type S = components['schemas']

/** Keep historical evidence tagged to its source; fence target changes and unmounts. */
export function useDispatchLoot(
  model: Coordinator,
  target: { id: string; owner: string; kind: 'Planet' | 'Moon' } | undefined,
  revision: string,
) {
  const binding = useStore(model.store, (state) =>
    state.binding ? bindingKey(state.binding) : null,
  )
  const id = target?.id
  const [read, setRead] = useState<{
    model: Coordinator
    binding: string | null
    id: string
    report?: S['ReportHeader4'] | null
    error?: boolean
  } | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    void model.latestEspionage(id).then(
      (report) => {
        if (active) setRead({ model, binding, id, report })
      },
      () => {
        if (active) setRead({ model, binding, id, error: true })
      },
    )
    return () => {
      active = false
    }
  }, [model, binding, id, revision])
  const current =
    read?.model === model && read.binding === binding && read.id === id
      ? read
      : null
  const observed =
    target && current?.report
      ? matchingResourceObservation(current.report, target)
      : null
  return { id, current, observed }
}
