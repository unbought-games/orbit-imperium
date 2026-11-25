import { useEffect, useMemo } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import {
  cargoAmounts,
  cargoInstruction,
  type CargoDraft,
} from '../client-model/dispatch-cargo'
import {
  destinationError,
  dispatchObservationError,
} from '../client-model/dispatch-validation'
import { dispatchSelection } from '../client-model/dispatch-timing'
import type { DispatchDraft } from './missions'

type S = components['schemas']

// Timing already resolved this destination. Cargo edits only change launch terms.
export function preparedIntent(
  estimate: S['FleetEstimate4'] | S['FleetTerms4'] | undefined,
  draft: CargoDraft,
  source: DispatchDraft | null,
  coordinates: S['Coordinates'] | null,
  kind: 'Moon' | 'Planet',
  player: string,
) {
  if (!estimate || !coordinates) return null
  const { intent } = estimate
  if (
    destinationError(
      intent.mission,
      intent.destination,
      player,
      intent.origin,
    ) ||
    dispatchObservationError(
      source,
      dispatchSelection(intent.mission, coordinates, kind),
      intent.destination,
    ) ||
    (intent.mission === 'DestroyMoon' &&
      !intent.ships.some((s) => s.ship_type === 'Dreadnought'))
  )
    return null
  try {
    const fill = cargoInstruction(draft)
    return {
      ...intent,
      cargo: cargoAmounts(draft.entered),
      ...(fill ? { cargo_fill: fill } : {}),
    }
  } catch {
    return null
  }
}

export function usePreparedFleetQuote(
  model: Coordinator,
  revision: string,
  intent: S['FleetIntent4'] | null,
) {
  const key = intent ? JSON.stringify(intent) : null
  // A new key or revision starts a different preparation, even when an edit
  // returns to an earlier key before its replacement request has settled.
  const preparation = useMemo(
    () => createFleetPreparation(),
    [key, revision, model],
  )
  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => {
      void preparation.load(() =>
        model.world({ type: 'FleetQuote', intent: JSON.parse(key) }),
      )
    }, 150)
    return () => {
      clearTimeout(timer)
      preparation.cancel()
    }
  }, [model, key, preparation])
  return () => {
    const state = model.store.getState()
    if (
      state.view?.viewer_revision !== revision ||
      !state.ready ||
      state.stale ||
      state.connectionInterrupted
    )
      return null
    return preparation.valid(state.view.profile_hash)
  }
}

export function createFleetPreparation() {
  let generation = 0
  let prepared: { at: number; terms: S['FleetTerms4'] } | undefined
  return {
    cancel() {
      generation++
      prepared = undefined
    },
    async load(read: () => ReturnType<Coordinator['world']>) {
      const request = ++generation
      prepared = undefined
      try {
        const terms = await read()
        if (
          request === generation &&
          terms &&
          'terms_hash' in terms &&
          'slot_limit' in terms
        )
          prepared = { terms, at: performance.now() }
      } catch {
        /* Review presents the authoritative failure if requested. */
      }
    },
    valid(profile: string) {
      return prepared &&
        prepared.terms.profile_hash === profile &&
        performance.now() - prepared.at < 15 * 60_000
        ? prepared.terms
        : null
    },
  }
}
