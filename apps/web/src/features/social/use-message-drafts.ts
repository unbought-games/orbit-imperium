import { useEffect, useState } from 'react'
import type { SocialRequest } from '../../client-model/social'

/** User edits stay local to this workspace and survive changing conversations. */
export function useMessageDrafts(completed: SocialRequest | null) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  useEffect(() => {
    const action = completed?.action
    if (action?.type !== 'Send' && action?.type !== 'Circular') return
    const key = action.type === 'Send' ? action.player : action.alliance
    setDrafts((current) => {
      if (current[key] !== action.body) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [completed])
  return {
    get: (target: string) => drafts[target] ?? '',
    set: (target: string, body: string) =>
      setDrafts((current) => ({ ...current, [target]: body })),
  }
}
