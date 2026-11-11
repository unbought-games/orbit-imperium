import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import { readRecruitmentAlliance } from '../adapters/alliances'
export function usePublicAlliance(
  universe: string,
  alliance?: string,
  invitation?: string,
) {
  const [store] = useState(() =>
    createStore<{
      data: components['schemas']['PublicAlliance'] | null
      error: string
    }>(() => ({ data: null, error: '' })),
  )
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const abort = new AbortController()
    store.setState({ data: null, error: '' })
    if (alliance || invitation)
      void readRecruitmentAlliance(universe, alliance, invitation, abort.signal)
        .then((data) => {
          if (!abort.signal.aborted) store.setState({ data })
        })
        .catch((error: unknown) => {
          if (!abort.signal.aborted)
            store.setState({
              error:
                error instanceof Error
                  ? error.message
                  : 'Alliance unavailable.',
            })
        })
    return () => abort.abort()
  }, [store, universe, alliance, invitation, retry])
  return { ...useStore(store), retry: () => setRetry((n) => n + 1) }
}
