import { useState } from 'react'
import { useAtomValue } from 'jotai'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import type { LocationKind } from '../shell/location-address'
import { useUniverseName } from '../shell/session-context'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { copiedLocationAtom } from './coordinate-memory'
import { useDispatch } from './use-dispatch'
import type { DispatchNavigation } from './routed-dispatch'
import { DispatchView } from './dispatch-view'
type S = components['schemas']
export type DispatchDraft = {
  reviewOnOpen?: boolean
  attackGroup?: string
  ships?: Record<string, string>
  speed?: number
  origin?: string
  targetKind?: LocationKind
  coordinates: S['Coordinates']
  mission:
    | 'Transport'
    | 'Espionage'
    | 'Harvest'
    | 'Attack'
    | 'Colonize'
    | 'Deploy'
    | 'Hold'
  observedAt?: number
  target?: S['MissionDestination4']
}
export { MissionFleets } from './mission-fleets'
export function Dispatch(props: {
  model: Coordinator
  view: S['BoundView4']
  body: S['BodyV3']
  draft: DispatchDraft | null
  navigation?: DispatchNavigation
}) {
  const universeName = useUniverseName()
  const occupiedSlots = useStore(props.model.store, occupiedFleetSlots)
  const recentlyCopied = useAtomValue(copiedLocationAtom)
  const [draft] = useState(props.draft)
  const dispatch = useDispatch({ ...props, draft })
  return (
    <DispatchView
      {...props}
      draft={draft}
      universeName={universeName}
      occupiedSlots={occupiedSlots}
      recentlyCopied={recentlyCopied}
      dispatch={dispatch}
    />
  )
}
