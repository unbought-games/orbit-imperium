import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { useStore } from 'zustand'
import type { components } from '../contracts'
import { shipAppearancesApi } from '../adapters/ship-appearances'
import { ShipAppearancesController } from '../client-model/ship-appearances'
import { shipCustomizationEnabled } from '../client-model/ship-customization-enabled'
import { InsigniaContext } from './insignia-context'

export const ShipAppearancesContext =
  createContext<ShipAppearancesController | null>(null)
const empty = new ShipAppearancesController(async () => {
  throw Error('No customization session')
})

export function useShipAppearances() {
  const controller = useContext(ShipAppearancesContext) ?? empty
  const observation = useStore(controller.store)
  return {
    ...observation,
    perform: controller.perform,
    reload: controller.reload,
  }
}

export function ShipAppearancesProvider({
  binding,
  csrf,
  children,
}: {
  binding: components['schemas']['Binding']
  csrf: string
  children: ReactNode
}) {
  if (!shipCustomizationEnabled) return children
  return (
    <ActiveShipAppearancesProvider binding={binding} csrf={csrf}>
      {children}
    </ActiveShipAppearancesProvider>
  )
}

function ActiveShipAppearancesProvider({
  binding,
  csrf,
  children,
}: {
  binding: components['schemas']['Binding']
  csrf: string
  children: ReactNode
}) {
  const { account, universe, player, epoch } = binding
  const controller = useMemo(
    () =>
      new ShipAppearancesController(
        shipAppearancesApi({ account, universe, player, epoch }, csrf),
      ),
    [account, universe, player, epoch, csrf],
  )
  const insignias = useContext(InsigniaContext)
  useEffect(() => {
    const stop = controller.start()
    const refresh = () => {
      if (document.visibilityState === 'visible') void controller.reload()
    }
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      stop()
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [controller])
  useEffect(
    () =>
      insignias?.store.subscribe((state, previous) => {
        if (state.snapshot !== previous.snapshot && state.snapshot)
          void controller.reload()
      }),
    [controller, insignias],
  )
  return (
    <ShipAppearancesContext.Provider value={controller}>
      {children}
    </ShipAppearancesContext.Provider>
  )
}
