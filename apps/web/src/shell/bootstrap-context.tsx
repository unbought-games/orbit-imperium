import { createContext, useContext, useState, type ReactNode } from 'react'
import { RuntimeController } from '../adapters/runtime-controller'
import { browserDependencies, type AppRuntime } from '../adapters/runtime'
const Context = createContext<RuntimeController | null>(null)
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
  return <Context.Provider value={controller}>{children}</Context.Provider>
}
export function useRuntimeController() {
  const value = useContext(Context)
  if (!value) throw Error('Missing bootstrap provider')
  return value
}
