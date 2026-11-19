import { createContext, useContext, useState, type ReactNode } from 'react'
import { RuntimeController } from '../adapters/runtime-controller'
import { browserDependencies, type AppRuntime } from '../adapters/runtime'
export const RuntimeControllerContext = createContext<RuntimeController | null>(
  null,
)
export function BootstrapProvider({
  initialRuntime,
  children,
}: {
  initialRuntime: AppRuntime
  children: ReactNode
}) {
  const [controller] = useState(
    () => new RuntimeController(initialRuntime, browserDependencies()),
  )
  return (
    <RuntimeControllerContext.Provider value={controller}>
      {children}
    </RuntimeControllerContext.Provider>
  )
}
export function useRuntimeController() {
  const value = useContext(RuntimeControllerContext)
  if (!value) throw Error('Missing bootstrap provider')
  return value
}
