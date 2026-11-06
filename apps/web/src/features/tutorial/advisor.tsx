import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
} from 'react'
import { useMatches } from '@tanstack/react-router'
import {
  arrow as arrowMiddleware,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  useClick,
  useDismiss,
  useInteractions,
  useRole,
  FloatingPortal,
  FloatingFocusManager,
  FloatingArrow,
} from '@floating-ui/react'
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

type Trigger = (
  props?: ComponentPropsWithRef<'button'>,
  speaking?: boolean,
) => ReactNode
type Props = {
  children: Trigger
  suspended: boolean
  onOpenCommands: () => void
}

/** The single HUD integration point. Catalog screens know nothing about the tutorial. */
export function TutorialAdvisor({
  children,
  suspended,
  onOpenCommands,
}: Props) {
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
  const tip = celebrating
    ? {
        title: 'Nicely done!',
        triggerLabel: 'briefing accomplishment',
        paragraphs: [],
      }
    : lesson
      ? advisorLessons[lesson]
      : null
  const bubble = useAdvisorVisit(scope, celebration.event ?? lesson, suspended)
  useRememberCelebration(
    scope,
    celebration.receipts.map((receipt) => receipt.id),
    bubble.open,
  )
  const finishCelebration = () => {
    bubble.setExpanded(false)
    celebration.clear()
  }
  return (
    <>
      {children(
        tip
          ? {
              ...bubble.getReferenceProps({
                'aria-label': `${bubble.open ? 'Hide' : 'Show'} ${tip.triggerLabel}`,
              }),
              ref: bubble.refs.setReference,
            }
          : undefined,
        bubble.open,
      )}
      {tip && bubble.open && (
        <FloatingPortal>
          <FloatingFocusManager
            context={bubble.context}
            modal={false}
            initialFocus={-1}
          >
            <div
              ref={bubble.refs.setFloating}
              style={bubble.floatingStyles}
              className={styles.bubble}
              {...bubble.getFloatingProps({ 'aria-label': tip.title })}
            >
              <FloatingArrow
                ref={bubble.arrow}
                context={bubble.context}
                fill="var(--surface-raised)"
              />
              {celebrating && data ? (
                <AdvisorCelebrationContent
                  data={data}
                  receipts={celebration.receipts}
                  onNavigate={finishCelebration}
                />
              ) : (
                <div
                  className={styles.content}
                  role="status"
                  aria-live="polite"
                >
                  <h2>{tip.title}</h2>
                  {tip.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {lesson === 'production-settings' && (
                    <ProductionReviewAction />
                  )}
                </div>
              )}
              <footer>
                <span>Click me to hide this.</span>
                {!celebrating && (
                  <BriefingLink onClick={() => bubble.setExpanded(false)} />
                )}
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => {
                    // The speech bubble disappears when the modal opens. Give
                    // native dialog focus restoration a persistent return target.
                    const trigger = bubble.refs.domReference.current
                    if (trigger instanceof HTMLElement)
                      trigger.focus({ preventScroll: true })
                    bubble.setExpanded(false)
                    onOpenCommands()
                  }}
                >
                  Command uplink
                </Button>
              </footer>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}

function useAdvisorVisit(
  scope: string,
  lesson: string | null,
  suspended: boolean,
) {
  // The visit ID is interaction history, not a copy of route/game data. Reset
  // only the disclosure choice when entering another lesson; keep the orb mounted.
  const [visit, setVisit] = useState(() => ({
    scope,
    lesson,
    expanded: lesson ? !advisorHistory.seen(scope, lesson) : false,
  }))
  if (visit.scope !== scope || visit.lesson !== lesson) {
    setVisit({
      scope,
      lesson,
      expanded: lesson ? !advisorHistory.seen(scope, lesson) : false,
    })
  }
  const setExpanded = (expanded: boolean) =>
    setVisit({ scope, lesson, expanded })
  const open =
    lesson !== null && visit.lesson === lesson && visit.expanded && !suspended
  useEffect(() => {
    if (open && lesson) advisorHistory.remember(scope, lesson)
  }, [scope, lesson, open])
  const arrow = useRef<SVGSVGElement>(null)
  const floating = useFloating({
    open,
    onOpenChange: setExpanded,
    placement: 'top-end',
    strategy: 'fixed',
    middleware: [
      offset(16),
      flip(),
      shift({ padding: 12 }),
      arrowMiddleware({ element: arrow }),
    ],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(floating.context)
  const dismiss = useDismiss(floating.context, { outsidePress: false })
  const role = useRole(floating.context, { role: 'dialog' })
  const interactions = useInteractions([click, dismiss, role])
  return { open, setExpanded, arrow, ...floating, ...interactions }
}
