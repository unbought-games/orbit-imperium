import { useState } from 'react'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { advisorHistory } from './advisor-history'
import { briefingAttentionEvents } from './briefing-attention'

export function useBriefingAttention(scope: string, data: TutorialData | null) {
  const [visit, setVisit] = useState<{
    scope: string
    events: string[]
  } | null>(null)
  const events = briefingAttentionEvents(data)
  const attention = events.some(
    (event) =>
      !(visit?.scope === scope && visit.events.includes(event)) &&
      !advisorHistory.seen(scope, event),
  )
  const acknowledge = () => {
    for (const event of events) advisorHistory.remember(scope, event)
    // Store only the IDs acknowledged by this click, not completion flags.
    setVisit({ scope, events })
  }
  return { attention, acknowledge }
}
