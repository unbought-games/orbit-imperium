import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useStore } from 'zustand'
import { PlayerPreferencesController } from '../client-model/player-preferences'
import { playerPreferencesApi } from '../adapters/player-preferences'
import type { Binding } from '../client-model/commands'

export const PlayerPreferencesContext =
  createContext<PlayerPreferencesController | null>(null)
export function PlayerPreferencesProvider({
  binding,
  csrf,
  children,
}: {
  binding: Binding
  csrf: string
  children: ReactNode
}) {
  const { account, player, universe, epoch } = binding
  const controller = useMemo(
    () =>
      new PlayerPreferencesController(
        playerPreferencesApi({ account, player, universe, epoch }, csrf),
      ),
    [account, player, universe, epoch, csrf],
  )
  useEffect(() => () => controller.stop(), [controller])
  return (
    <PlayerPreferencesContext.Provider value={controller}>
      {children}
    </PlayerPreferencesContext.Provider>
  )
}
export function usePlayerPreferences() {
  const controller = useContext(PlayerPreferencesContext)
  if (!controller) throw Error('Player preferences require a game session.')
  const state = useStore(controller.store)
  useEffect(() => {
    void controller.load()
  }, [controller])
  return { ...state, load: controller.load, save: controller.save }
}
