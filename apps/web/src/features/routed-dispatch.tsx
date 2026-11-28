import {
  Navigate,
  useNavigate,
  useRouter,
  useLocation,
} from '@tanstack/react-router'
import { useLayoutEffect, useMemo } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { draftFromSearch, dispatchSearch } from '../shell/dispatch-location'
import { useDispatchSession } from '../shell/dispatch-session-context'
import { routeTarget } from '../shell/route-target'
import { useUniverseName } from '../shell/session-context'
import { Dispatch } from './missions'
import { reviewedDraft, type ReviewedFleet } from './dispatch-review-session'

type S = components['schemas']
export type DispatchNavigation = {
  restored?: ReviewedFleet
  expired: boolean
  open: (terms: S['FleetTerms4'], coordinates: S['Coordinates']) => void
  claimSend: () => boolean
  finishSend: () => void
  close: (action: 'edit' | 'send') => boolean
}

export function RoutedDispatch({
  model,
  view,
  body,
}: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
}) {
  const session = useDispatchSession()
  const universe = useUniverseName()
  const navigate = useNavigate()
  const router = useRouter()
  const location = useLocation()
  const path = location.pathname.replace(/\/$/, '')
  const editorPath = `/b/${body.id}/dispatch`
  const reviewing = path.endsWith(`${editorPath}/review`)
  const editing = path.endsWith(editorPath)
  const {
    dispatchEditor,
    dispatchReview,
    dispatchObservation,
    dispatchExpired,
  } = location.state
  const entry = location.state.__TSR_key!
  // Capture entry data once. Consuming a preparation or retiring a review must
  // never change the mounted editor while its navigation is committing.
  const initial = useMemo(() => {
    const restored = session.match(dispatchReview, body.id)
    const source = draftFromSearch(location.search)
    const draft = restored
      ? reviewedDraft(restored)
      : source
        ? {
            ...source,
            ...(location.state.dispatchSession === session.id
              ? dispatchObservation
              : {}),
            reviewOnOpen: session.shouldPrepare(dispatchEditor),
          }
        : null
    return { restored, draft }
  }, [
    session,
    location,
    body.id,
    dispatchReview,
    dispatchEditor,
    dispatchObservation,
  ])
  const { restored, draft } = initial
  const editor = restored?.editor ?? dispatchEditor ?? entry
  useLayoutEffect(() => {
    if (editing && !dispatchExpired) session.enterEditor()
  }, [session, entry, editing, dispatchExpired])
  if (reviewing && !restored)
    return (
      <Navigate
        {...routeTarget(universe, 'dispatch', body.id)}
        state={{ dispatchExpired: true }}
        replace
      />
    )
  const current = () => router.history.location.state.__TSR_key === entry
  const claimSend = () => {
    if (!restored || !current() || !session.match(restored.id, body.id))
      return false
    session.retire(restored.id)
    return true
  }
  const returnToEditor = (source: ReviewedFleet['source']) => {
    void navigate({
      ...routeTarget(universe, 'dispatch', body.id),
      search: source ? dispatchSearch(source) : {},
      state: {
        dispatchEditor: editor,
        ...(source
          ? {
              dispatchSession: session.id,
              dispatchObservation: {
                target: source.target,
                observedAt: source.observedAt,
                ships: source.ships,
                speed: source.speed,
              },
            }
          : {}),
      },
      replace: true,
    })
  }
  const navigation: DispatchNavigation = {
    restored,
    expired: !!dispatchExpired,
    open: (terms, coordinates) => {
      if (!current()) return
      // A replaced review retains the editor it came from, including a manual
      // entry with no prepared-source search parameters.
      const review = session.open(
        editor,
        terms,
        coordinates,
        restored ? restored.source : draft,
      )
      void navigate({
        ...routeTarget(universe, 'dispatch', body.id, 'review'),
        state: { dispatchReview: review.id, dispatchEditor: editor },
        replace: true,
      })
    },
    claimSend,
    finishSend: () => {
      if (current()) returnToEditor(null)
    },
    close: (action) => {
      if (!claimSend()) return false
      returnToEditor(action === 'send' ? null : (restored?.source ?? null))
      return true
    },
  }
  return (
    <Dispatch
      key={editor}
      model={model}
      view={view}
      body={body}
      draft={draft}
      navigation={navigation}
    />
  )
}
