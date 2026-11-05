import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import {
  readArchive,
  ArchiveReadError,
  editProfile,
  type EmpireProfile,
  type ProfileAction,
} from '../adapters/empire-history'
import { http, HttpError, type Session } from '../adapters/http'

export function useArchive<T>(schema: string, path: string) {
  const [store] = useState(() =>
    createStore<{
      data: T | null
      session: Session | null
      loading: boolean
      busy: boolean
      error: string
    }>(() => ({
      data: null,
      session: null,
      loading: true,
      busy: false,
      error: '',
    })),
  )
  const state = useStore(store)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    store.setState({ loading: true, error: '' })
    void Promise.all([
      readArchive<T>(schema, path, controller.signal),
      http.session().catch(() => null),
    ])
      .then(([data, session]) => {
        if (!controller.signal.aborted)
          store.setState({ data, session, loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          store.setState({
            loading: false,
            ...(error instanceof ArchiveReadError &&
            [401, 404].includes(error.status)
              ? { data: null }
              : {}),
            error:
              error instanceof Error
                ? error.message
                : 'Unable to load history.',
          })
      })
    return () => controller.abort()
  }, [schema, path, revision, store])
  const retry = () => refresh((n) => n + 1)
  const save = async (profile: EmpireProfile, action: ProfileAction) => {
    if (!state.session || state.busy) return false
    store.setState({ busy: true, error: '' })
    try {
      await editProfile(
        profile,
        state.session.csrf,
        action,
        crypto.randomUUID(),
      )
      retry()
      return true
    } catch (error) {
      store.setState({
        error:
          error instanceof HttpError && error.status === 409
            ? 'This profile changed in another window. Refresh before saving again.'
            : 'Your change could not be saved. Refresh and try again.',
      })
      return false
    } finally {
      store.setState({ busy: false })
    }
  }
  return { ...state, retry, save }
}
