import { createContext, useState, type ReactNode } from 'react'
import { InsigniaController } from '../client-model/insignias'
import { insigniasApi } from '../adapters/insignias'
import type { components } from '../contracts'
export const InsigniaContext = createContext<InsigniaController | null>(null)
export function InsigniaProvider({
  binding,
  csrf,
  changed,
  children,
}: {
  binding: components['schemas']['Binding']
  csrf: string
  changed: () => void
  children: ReactNode
}) {
  const [controller] = useState(
    () => new InsigniaController(insigniasApi(binding, csrf), changed),
  )
  return (
    <InsigniaContext.Provider value={controller}>
      {children}
    </InsigniaContext.Provider>
  )
}
