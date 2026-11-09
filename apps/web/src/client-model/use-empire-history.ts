import { useEffect, useRef, useState } from 'react'
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
import { commandId } from '../adapters/command-id'

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
  const generation = useRef(0)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    store.setState({ loading: true, error: '' })
    void Promise.all([
      readArchive<T>(schema, path, controller.signal),
      http.session().catch(() => null),
    ])
      .then(([data, session]) => {
        if (!controller.signal.aborted && current === generation.current)
          store.setState({ data, session, loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && current === generation.current)
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
    if (!state.session || store.getState().busy || store.getState().loading)
      return false
    const current = ++generation.current
    store.setState({ busy: true, error: '' })
    let committed = false
    try {
      await editProfile(profile, state.session.csrf, action, commandId(crypto))
      committed = true
      const data = await readArchive<T>(
        schema,
        path,
        new AbortController().signal,
      )
      if (current === generation.current)
        store.setState({ data, loading: false })
      return true
    } catch (error) {
      store.setState({
        error: committed
          ? 'Your change was saved, but the profile could not be refreshed. Refresh to see the saved version.'
          : action.type === 'Identity' &&
              error instanceof HttpError &&
              [403, 404].includes(error.status)
            ? 'This identity or selected title is no longer available. Refresh to check your choices.'
            : error instanceof HttpError && error.status === 409
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
