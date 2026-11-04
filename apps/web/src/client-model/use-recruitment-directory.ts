import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { components } from '../contracts'
import { readRecruitmentDirectory } from '../adapters/alliances'
export function useRecruitmentDirectory(universe: string, query: string) {
  const [store] = useState(() =>
    createStore<{
      data: components['schemas']['RecruitmentDirectory'] | null
      loading: boolean
      error: string
    }>(() => ({ data: null, loading: true, error: '' })),
  )
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    store.setState({ loading: true, error: '' })
    void readRecruitmentDirectory(
      universe,
      new URLSearchParams(query),
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) store.setState({ data, loading: false })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          store.setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to load alliances.',
          })
      })
    return () => controller.abort()
  }, [universe, query, attempt, store])
  return { ...useStore(store), retry: () => setAttempt((n) => n + 1) }
}
