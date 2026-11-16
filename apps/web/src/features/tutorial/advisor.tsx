import { useEffect, useRef, useState } from 'react'
import { useMatches } from '@tanstack/react-router'
import { AdvisorBubble, type BubbleTrigger } from '../../ui/advisor-bubble'
import { bindingKey } from '../../client-model/commands'
import { useGameSession } from '../../shell/session-context'
import { resolveDestination } from '../../shell/routes'
import { Button } from '../../ui/button'
import { useTutorial } from './use-tutorial'
import { advisorLesson, advisorLessons } from './advisor-model'
import { advisorHistory } from './advisor-history'
import { BriefingLink } from './briefing-link'
import {
  useAdvisorCelebration,
  useRememberCelebration,
} from './advisor-celebration'
import { AdvisorCelebrationContent } from './advisor-celebration-content'
import { ProductionReviewAction } from './production-review-action'
import styles from './advisor.module.css'

type Props = {
  children: BubbleTrigger
  suspended: boolean
  onOpenCommands: () => void
}

/** The single HUD integration point. Catalog screens know nothing about the tutorial. */
export function TutorialAdvisor({
  children,
  suspended,
  onOpenCommands,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { view } = useGameSession()
  const { data } = useTutorial()
  const matches = useMatches()
  const leaf = matches[matches.length - 1]
  const params = leaf.params as { body?: string; item?: string }
  const route = resolveDestination(
    {
      universe: view.binding.universe,
      page: leaf.staticData.page ?? null,
      body: params.body,
      item: params.item,
    },
    view,
  )
  const lesson = advisorLesson(data, route)
  const scope = bindingKey(view.binding)
  const celebration = useAdvisorCelebration(scope, data)
  const celebrating = celebration.receipts.length > 0
  const finishCelebration = () => {
    const trigger = triggerRef.current
    if (trigger instanceof HTMLElement) trigger.focus({ preventScroll: true })
    bubble.finish(lesson)
    celebration.clear()
  }
  const bubble = useAdvisorVisit(
    scope,
    celebration.event ?? lesson,
    suspended,
    celebrating ? finishCelebration : undefined,
  )
  const tip = bubble.finished
    ? null
    : celebrating
      ? {
          title: 'Nicely done!',
          triggerLabel: 'briefing accomplishment',
          paragraphs: [],
        }
      : lesson
        ? advisorLessons[lesson]
        : null
  useRememberCelebration(
    scope,
    celebration.receipts.map((receipt) => receipt.id),
    bubble.open,
  )
  return (
    <AdvisorBubble
      open={bubble.open && !!tip}
      active={!!tip}
      onOpenChange={bubble.onOpenChange}
      trigger={children}
      triggerRef={triggerRef}
      triggerLabel={`${bubble.open ? 'Hide' : 'Show'} ${tip?.triggerLabel ?? 'briefing'}`}
      label={tip?.title ?? ''}
    >
      {tip && (
        <>
          {celebrating && data ? (
            <AdvisorCelebrationContent
              data={data}
              receipts={celebration.receipts}
              onNavigate={finishCelebration}
            />
          ) : (
            <div className={styles.content} role="status" aria-live="polite">
              <h2>{tip.title}</h2>
              {tip.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {lesson === 'production-settings' && <ProductionReviewAction />}
            </div>
          )}
          <footer>
            {!celebrating && (
              <BriefingLink onClick={() => bubble.setExpanded(false)} />
            )}
            <Button
              variant="ghost"
              size="small"
              onClick={() => {
                // The speech bubble disappears when the modal opens. Give
                // native dialog focus restoration a persistent return target.
                const trigger = triggerRef.current
                if (trigger instanceof HTMLElement)
                  trigger.focus({ preventScroll: true })
                if (celebrating) finishCelebration()
                else bubble.setExpanded(false)
                onOpenCommands()
              }}
            >
              Command uplink
            </Button>
          </footer>
        </>
      )}
    </AdvisorBubble>
  )
}

function useAdvisorVisit(
  scope: string,
  lesson: string | null,
  suspended: boolean,
  onDismiss?: () => void,
) {
  // The visit ID is interaction history, not a copy of route/game data. Reset
  // only the disclosure choice when entering another lesson; keep the orb mounted.
  const [visit, setVisit] = useState(() => ({
    scope,
    lesson,
    expanded: lesson ? !advisorHistory.seen(scope, lesson) : false,
    finished: false,
  }))
  if (visit.scope !== scope || visit.lesson !== lesson) {
    setVisit({
      scope,
      lesson,
      expanded: lesson ? !advisorHistory.seen(scope, lesson) : false,
      finished: false,
    })
  }
  const setExpanded = (expanded: boolean) =>
    setVisit({ scope, lesson, expanded, finished: false })
  // Dismissing an accomplishment returns this visit to commands, including
  // when completion made another route lesson eligible underneath the bubble.
  const finish = (nextLesson: string | null) =>
    setVisit({ scope, lesson: nextLesson, expanded: false, finished: true })
  const open =
    lesson !== null && visit.lesson === lesson && visit.expanded && !suspended
  useEffect(() => {
    if (open && lesson) advisorHistory.remember(scope, lesson)
  }, [scope, lesson, open])
  const onOpenChange = (expanded: boolean) => {
    if (!expanded && onDismiss) onDismiss()
    else setExpanded(expanded)
  }
  return {
    open,
    setExpanded,
    finish,
    finished: visit.finished,
    onOpenChange,
  }
}
