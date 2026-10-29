import { useEffect, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { dispatchSelection } from '../client-model/dispatch-timing'
import {
  dispatchObservationError,
  dispatchFailure,
} from '../client-model/dispatch-validation'
type S = components['schemas']
type Request = {
  observation?: {
    coordinates: S['Coordinates']
    target?: S['MissionDestination4']
  }
  kind: 'Planet' | 'Moon'
  coordinates: S['Coordinates']
  intent: Omit<S['FleetIntent4'], 'destination'>
}
type Result = {
  key: string
  terms?: S['FleetTerms4'] | S['FleetEstimate4']
  error?: string
}

/** A read-only server quote; only explicit Review opens the launch confirmation. */
export function useDispatchTiming(
  model: Coordinator,
  request: Request | null,
  revision: string,
  enabled: boolean,
  estimateOnly = false,
) {
  const key =
    request && enabled
      ? JSON.stringify({ ...request, revision, estimateOnly })
      : null
  const [result, setResult] = useState<Result | null>(null)
  useEffect(() => {
    if (!key || !enabled) return
    let current = true
    const timer = setTimeout(() => {
      const input: Request = JSON.parse(key)
      void (async () => {
        try {
          const destination = await model.world({
            type: 'ResolveDestination',
            selection: dispatchSelection(
              input.intent.mission,
              input.coordinates,
              input.kind,
            ),
          })
          if (!current) return
          if (!destination || !('type' in destination)) throw Error('NotFound')
          const problem = dispatchObservationError(
            input.observation ?? null,
            dispatchSelection(
              input.intent.mission,
              input.coordinates,
              input.kind,
            ),
            destination,
          )
          if (problem) {
            setResult({ key, error: problem })
            return
          }
          const terms = await model.world({
            type: estimateOnly ? 'FleetEstimate' : 'FleetQuote',
            intent: { ...input.intent, destination },
          })
          if (!current) return
          if (!terms || !('duration_ms' in terms)) throw Error('Unavailable')
          setResult({ key, terms })
        } catch (error) {
          if (current) setResult({ key, error: dispatchFailure(error) })
        }
      })()
    }, 250)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [model, key, revision, enabled, estimateOnly])
  return key && result?.key === key ? result : null
}
