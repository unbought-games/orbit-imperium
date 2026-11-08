import { createContext, useContext } from 'react'
import { SessionContext } from '../shell/session-context'

/** Chosen looks delivered with a public projection such as a Galaxy system. */
export const BodyAppearanceContext = createContext<
  Readonly<Record<string, number>>
>({})

export function useBodyAppearance(id: string | undefined): number | undefined {
  const session = useContext(SessionContext)
  const published = useContext(BodyAppearanceContext)
  if (!id) return undefined
  const own =
    session?.view.protocol === 4
      ? session.view.body_appearances?.[id]
      : undefined
  return published[id] ?? own
}
