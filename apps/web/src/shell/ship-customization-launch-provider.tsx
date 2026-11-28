import { lazy, Suspense, useState, type ReactNode } from 'react'
import { shipCustomizationEnabled } from '../client-model/ship-customization-enabled'
import { ShipCustomizationLaunchContext } from './ship-customization-launch-context'

import { useRouter } from '@tanstack/react-router'
import { useUniverseName } from './session-context'
import { routeTarget } from './route-target'

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
  const [editor, setEditor] = useState<{ target: string; body: string } | null>(
    null,
  )
  const universeName = useUniverseName()
  const router = useRouter()
  if (!shipCustomizationEnabled) return children
  return (
    <ShipCustomizationLaunchContext.Provider
      value={{ open: (target, body) => setEditor({ target, body }) }}
    >
      {children}
      {editor && ShipCustomizer && (
        <Suspense fallback={<p role="status">Opening hangar…</p>}>
          <ShipCustomizer
            target={editor.target}
            emblemHref={
              router.buildLocation({
                ...routeTarget(
                  universeName,
                  'settings',
                  editor.body,
                  'identity',
                ),
                hash: 'empire-insignia',
              }).href
            }
            guideHref={
              router.buildLocation({
                ...routeTarget(universeName, 'rewards', editor.body),
                hash: 'dye-unlocks',
              }).href
            }
            onClose={() => setEditor(null)}
          />
        </Suspense>
      )}
    </ShipCustomizationLaunchContext.Provider>
  )
}
