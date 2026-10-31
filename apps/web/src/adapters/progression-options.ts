import {
  canonical,
  type BoundProgressionOptions,
  type QueryContext,
  type QuoteRequest,
} from '../client-model/commands'
import { ContractDataError } from '../client-model/schema'

type Entry = {
  request: QuoteRequest
  resolve: (value: BoundProgressionOptions) => void
  reject: (error: unknown) => void
}
type Batch = { context: QueryContext; entries: Map<string, Entry> }
type Read = (
  context: QueryContext,
  requests: QuoteRequest[],
) => Promise<BoundProgressionOptions[]>

/** Coalesce one render's inspections; retain no quotes or derived game state.
 * Cost and action consumers share the same wire request, even when their
 * invalidation policies differ. A later render always gets fresh server facts.
 */
export function progressionOptionsLoader(read: Read) {
  const batches = new Map<string, Batch>()
  async function flush(key: string, batch: Batch) {
    batches.delete(key)
    const entries = [...batch.entries.values()]
    try {
      const options = await read(
        batch.context,
        entries.map((e) => e.request),
      )
      // Validate the entire collection before releasing any row. This also
      // prevents partial activation if the server omits or reorders results.
      if (
        options.length !== entries.length ||
        options.some(
          (option, index) =>
            canonical(option.binding) !== canonical(batch.context.binding) ||
            option.request_id !== batch.context.request_id ||
            canonical(option.request) !== canonical(entries[index].request) ||
            option.viewer_revision !== options[0].viewer_revision ||
            option.as_of_ms !== options[0].as_of_ms ||
            option.protocol !== options[0].protocol,
        )
      )
        throw new ContractDataError('BoundProgressionOptionsBatch')
      entries.forEach((entry, index) => entry.resolve(options[index]))
    } catch (error) {
      entries.forEach((entry) => entry.reject(error))
    }
  }
  return (context: QueryContext, request: QuoteRequest) => {
    const key = canonical(context.binding)
    let batch = batches.get(key)
    const requestKey = canonical(request)
    // The endpoint's bounded size exceeds every catalog. Split only unusually
    // large callers; never send an oversized batch the server must reject.
    if (batch && batch.entries.size === 128 && !batch.entries.has(requestKey)) {
      void flush(key, batch)
      batch = undefined
    }
    if (!batch) {
      batch = { context: structuredClone(context), entries: new Map() }
      batches.set(key, batch)
      const captured = batch
      queueMicrotask(() => {
        if (batches.get(key) === captured) void flush(key, captured)
      })
    }
    const existing = batch.entries.get(requestKey)
    // Each consumer keeps its own correlation ID for the coordinator's
    // session fencing. Wire correlation is checked once before fan-out.
    return new Promise<BoundProgressionOptions>((resolve, reject) => {
      const accept = (option: BoundProgressionOptions) =>
        resolve({ ...option, request_id: context.request_id })
      if (existing) {
        const previousResolve = existing.resolve
        const previousReject = existing.reject
        existing.resolve = (option) => {
          previousResolve(option)
          accept(option)
        }
        existing.reject = (error) => {
          previousReject(error)
          reject(error)
        }
      } else {
        batch.entries.set(requestKey, {
          request: structuredClone(request),
          resolve: accept,
          reject,
        })
      }
    })
  }
}
