/** Presentation history only. Never changes tutorial progress or game state. */
export function createAdvisorHistory(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
) {
  const fallback = new Set<string>()
  const key = (scope: string, lesson: string) =>
    `orbit.tutorial-advisor.v1:${scope}:${lesson}`
  return {
    seen(scope: string, lesson: string) {
      const id = key(scope, lesson)
      if (fallback.has(id)) return true
      try {
        return storage().getItem(id) === 'seen'
      } catch {
        return false
      }
    },
    remember(scope: string, lesson: string) {
      const id = key(scope, lesson)
      fallback.add(id)
      try {
        storage().setItem(id, 'seen')
      } catch {
        // Private/restricted storage still remembers visits for this session.
      }
    },
  }
}

export const advisorHistory = createAdvisorHistory(() => localStorage)
