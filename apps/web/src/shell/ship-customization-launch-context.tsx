import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { shipCustomizationEnabled } from '../client-model/ship-customization-enabled'

const ShipCustomizer = lazy(() =>
  import('../features/ship-customization/ship-customizer').then((module) => ({
    default: module.ShipCustomizer,
  })),
)
const ShipCustomizationLaunchContext = createContext({
  open: (_target: string) => {},
})
export const useShipCustomizationLaunch = () =>
  useContext(ShipCustomizationLaunchContext)

export function ShipCustomizationLaunchProvider({
  children,
}: {
  children: ReactNode
}) {
  const [target, setTarget] = useState<string | null>(null)
  if (!shipCustomizationEnabled) return children
  return (
    <ShipCustomizationLaunchContext.Provider value={{ open: setTarget }}>
      {children}
      {target && (
        <Suspense fallback={<p role="status">Opening hangar…</p>}>
          <ShipCustomizer target={target} onClose={() => setTarget(null)} />
        </Suspense>
      )}
    </ShipCustomizationLaunchContext.Provider>
  )
}
