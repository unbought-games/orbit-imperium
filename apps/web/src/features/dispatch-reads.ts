import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { dispatchSelection } from '../client-model/dispatch-timing'
import {
  dispatchObservationError,
  dispatchFailure,
} from '../client-model/dispatch-validation'
type S = components['schemas']
export type DispatchTimingRequest = {
  site?: S['SiteSelection4']
  observation?: {
    coordinates: S['Coordinates']
    target?: S['MissionDestination4']
  }
  kind: 'Planet' | 'Moon'
  coordinates: S['Coordinates']
  intent: Omit<S['FleetIntent4'], 'destination'>
}

export type DispatchTimingResult = {
  terms?: S['FleetTerms4'] | S['FleetEstimate4']
  error?: string
}

/** Cancellation fences publication and prevents a stale resolution starting another read. */
export function startDispatchRead<T>(
  read: (current: () => boolean) => Promise<T>,
  publish: (value: T) => void,
) {
  let current = true
  const done = read(() => current).then((value) => {
    if (current) publish(value)
  })
  return {
    done,
    cancel: () => {
      current = false
    },
  }
}

export function startDispatchTiming(
  world: Coordinator['world'],
  input: DispatchTimingRequest,
  estimateOnly: boolean,
  publish: (result: DispatchTimingResult) => void,
) {
  return startDispatchRead<DispatchTimingResult>(async (current) => {
    try {
      const destination = await world(
        input.site
          ? { type: 'ResolveMissionSite', selection: input.site }
          : {
              type: 'ResolveDestination',
              selection: dispatchSelection(
                input.intent.mission,
                input.coordinates,
                input.kind,
              ),
            },
      )
      if (!current()) return {}
      if (!destination || !('type' in destination)) throw Error('NotFound')
      const problem = dispatchObservationError(
        input.observation ?? null,
        dispatchSelection(input.intent.mission, input.coordinates, input.kind),
        destination,
      )
      if (problem) return { error: problem }
      const terms = await world({
        type: estimateOnly ? 'FleetEstimate' : 'FleetQuote',
        intent: { ...input.intent, destination },
      })
      if (!terms || !('maximum_payload' in terms)) throw Error('Unavailable')
      return { terms }
    } catch (error) {
      return { error: dispatchFailure(error) }
    }
  }, publish)
}

export function startDispatchObservation(
  world: Coordinator['world'],
  galaxy: number,
  system: number,
  publish: (observation: S['GalaxySystem4'] | undefined) => void,
) {
  return startDispatchRead(async () => {
    try {
      const result = await world({ type: 'Galaxy', galaxy, system })
      return result && 'positions' in result ? result : undefined
    } catch {
      return undefined
    }
  }, publish)
}

/** Same-input refreshes may retain advisory evidence; another source or input may not. */
export function currentDispatchRead<T extends { model: object; key: string }>(
  model: object,
  key: string | null,
  read: T | null,
): T | null {
  return key && read?.model === model && read.key === key ? read : null
}
