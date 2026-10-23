import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useStore } from 'zustand'
import {
  PlayerProfilesController,
  currentPlayer,
} from '../client-model/player-profiles'
import {
  playerProfilesApi,
  type ProfileSource,
} from '../adapters/player-profiles'
import { useGameSession } from './session-context'

export const PlayerProfilesContext =
  createContext<PlayerProfilesController | null>(null)
export function PlayerProfilesProvider({
  csrf,
  children,
}: {
  csrf: string
  children: ReactNode
}) {
  const { view } = useGameSession()
  const [controller] = useState(
    () => new PlayerProfilesController(playerProfilesApi(view.binding, csrf)),
  )
  useEffect(() => {
    const stop = controller.start()
    const release = controller.watch({ type: 'SelfAccount' })
    return () => {
      release()
      stop()
    }
  }, [controller])
  return (
    <PlayerProfilesContext.Provider value={controller}>
      {children}
    </PlayerProfilesContext.Provider>
  )
}
function useController() {
  const controller = useContext(PlayerProfilesContext)
  if (!controller) throw new Error('Player profiles require a game session.')
  return controller
}
export function useProfileSource(
  source: ProfileSource | null,
  revision?: string,
) {
  const controller = useController()
  const key = source ? JSON.stringify(source) : null
  useEffect(() => {
    if (key) return controller.watch(JSON.parse(key) as ProfileSource)
  }, [controller, key, revision])
}
export function usePlayerDisplay(player: string) {
  const controller = useContext(PlayerProfilesContext)
  return useStore(controller?.store ?? emptyProfiles, (state) =>
    currentPlayer(state, player),
  )
}

// Standalone report renderers can show known names without an authenticated
// profile provider; this immutable empty store never carries account data.
const emptyProfiles = new PlayerProfilesController(async () => {
  throw new Error('No profile session')
}).store
