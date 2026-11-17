import { createContext, useContext } from 'react'

// Keep context identity independent of the lazily edited hangar module.
export const ShipCustomizationLaunchContext = createContext({
  open: (_target: string) => {},
})
export const useShipCustomizationLaunch = () =>
  useContext(ShipCustomizationLaunchContext)
