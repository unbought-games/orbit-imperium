import { lazy, Suspense, useState, type ReactNode } from 'react'
import { shipCustomizationEnabled } from '../client-model/ship-customization-enabled'
import { ShipCustomizationLaunchContext } from './ship-customization-launch-context'

const ShipCustomizer = shipCustomizationEnabled
  ? lazy(() =>
      import('../features/ship-customization/ship-customizer').then(
        (module) => ({
          default: module.ShipCustomizer,
        }),
      ),
    )
  : null
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
      {target && ShipCustomizer && (
        <Suspense fallback={<p role="status">Opening hangar…</p>}>
          <ShipCustomizer target={target} onClose={() => setTarget(null)} />
        </Suspense>
      )}
    </ShipCustomizationLaunchContext.Provider>
  )
}
