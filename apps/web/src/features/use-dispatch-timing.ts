import { useEffect, useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import {
  currentDispatchRead,
  startDispatchTiming,
  type DispatchTimingRequest,
  type DispatchTimingResult,
} from './dispatch-reads'
type Result = DispatchTimingResult & { key: string; model: Coordinator }

/** A read-only server quote; only explicit Review opens the launch confirmation. */
export function useDispatchTiming(
  model: Coordinator,
  request: DispatchTimingRequest | null,
  revision: string,
  enabled: boolean,
  estimateOnly = false,
) {
  const key =
    request && enabled ? JSON.stringify({ ...request, estimateOnly }) : null
  const [result, setResult] = useState<Result | null>(null)
  useEffect(() => {
    if (!key || !enabled) return
    let request: ReturnType<typeof startDispatchTiming> | undefined
    const timer = setTimeout(() => {
      request = startDispatchTiming(
        (query) => model.world(query),
        JSON.parse(key),
        estimateOnly,
        (result) => setResult({ key, model, ...result }),
      )
    }, 250)
    return () => {
      request?.cancel()
      clearTimeout(timer)
    }
  }, [model, key, revision, enabled, estimateOnly])
  // Revisions revalidate compatible advisory data; Review gets authoritative terms.
  return currentDispatchRead(model, key, result)
}
