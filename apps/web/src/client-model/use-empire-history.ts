import { useEffect, useRef, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import {
  readArchive,
  ArchiveReadError,
  editProfile,
  recoverProfile,
  profileEditReview,
  ProfileEditPending,
  ProfileEditReview,
  ProfileEditNotSent,
  type EmpireProfile,
  type ProfileAction,
} from '../adapters/empire-history'
import { http, HttpError, type Session } from '../adapters/http'
import {
  identityProblem,
  unavailableCommandAccess,
  unknownAccessMessage,
} from './command-window'

export function useArchive<T>(schema: string, path: string) {
  const [store] = useState(() =>
    createStore<{
      data: T | null
      session: Session | null
      loading: boolean
      busy: boolean
      error: string
      errorDetails: string
    }>(() => ({
      data: null,
      session: null,
      loading: true,
      busy: false,
      error: '',
      errorDetails: '',
    })),
  )
  const state = useStore(store)
  const generation = useRef(0)
  const [revision, refresh] = useState(0)
  useEffect(() => {
    const current = ++generation.current
    const controller = new AbortController()
    store.setState({ loading: true, error: '', errorDetails: '' })
    void Promise.all([
      readArchive<T>(schema, path, controller.signal),
      http.session().catch(() => null),
    ])
      .then(async ([data, session]) => {
        if (
          !controller.signal.aborted &&
          current === generation.current &&
          session &&
          schema === 'EmpireProfile'
        ) {
          try {
            if (
              await recoverProfile(
                data as EmpireProfile,
                session.account,
                session.csrf,
              )
            )
              data = await readArchive<T>(schema, path, controller.signal)
          } catch (error) {
            const problem =
              error instanceof ProfileEditReview
                ? error.message
                : identityProblem(error)
            if (problem)
              data = await readArchive<T>(schema, path, controller.signal)
            if (!controller.signal.aborted && current === generation.current)
              store.setState({
                error:
                  error instanceof ProfileEditReview
                    ? ''
                    : (problem ??
                      (unavailableCommandAccess(error)
                        ? unknownAccessMessage
                        : 'The earlier profile change is still unconfirmed. Refresh to check again.')),
              })
          }
        }
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
    store.setState({ busy: true, error: '', errorDetails: '' })
    let committed = false
    try {
      await editProfile(
        profile,
        state.session.account,
        state.session.csrf,
        action,
      )
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
      if (error instanceof ProfileEditNotSent) {
        if (current === generation.current)
          store.setState({ error: error.message, errorDetails: error.details })
        return false
      }
      if (error instanceof ProfileEditPending) {
        if (current === generation.current)
          store.setState({ error: error.message })
        return false
      }
      const problem =
        error instanceof ProfileEditReview
          ? error.message
          : identityProblem(error)
      if (problem) {
        if (current === generation.current)
          store.setState({
            error: error instanceof ProfileEditReview ? '' : problem,
          })
        try {
          const data = await readArchive<T>(
            schema,
            path,
            new AbortController().signal,
          )
          if (current === generation.current) store.setState({ data })
        } catch {
          /* The uncertainty notice remains visible until Refresh succeeds. */
        }
        return false
      }
      store.setState({
        error: committed
          ? 'Your change was saved, but the profile could not be refreshed. Refresh to see the saved version.'
          : action.type === 'Identity' &&
              error instanceof HttpError &&
              [403, 404].includes(error.status)
            ? 'This identity or selected title is no longer available. Refresh to check your choices.'
            : error instanceof HttpError && error.status === 409
              ? 'This profile changed in another window. Refresh before saving again.'
              : 'Your change is unconfirmed. Refresh to check the current profile.',
      })
      return false
    } finally {
      store.setState({ busy: false })
    }
  }
  // A blocked save, failed refetch or another tab can change the pending queue
  // independently of review drafts. Derive the current review from its scope.
  const profile =
    schema === 'EmpireProfile' ? (state.data as EmpireProfile | null) : null
  const review =
    profile &&
    state.session &&
    path.split('?')[0] === `/api/v4/empire-profiles/${profile.player}`
      ? profileEditReview(profile, state.session.account)
      : null
  const dismissReview = review
    ? () => {
        review.dismiss()
        retry()
      }
    : null
  const error = [state.error, review?.message].filter(Boolean).join(' ')
  return { ...state, error, retry, save, dismissReview }
}
