import { ArrowRight, Orbit } from 'lucide-react'
import { useGameSession } from '../../shell/session-context'
import { briefingRoute } from './briefing-route'
import { Button, ButtonLink } from '../../ui/button'
import { Heading, Text } from '../../ui/typography'
import { useTutorial } from './use-tutorial'
import { briefingProgress } from './model'
import { BriefingLink } from './briefing-link'
import styles from './tutorial.module.css'

export function BriefingWelcome() {
  const { universeName, view } = useGameSession()
  const { data, error, retry } = useTutorial()
  const progress = view.protocol === 4 ? briefingProgress(data, view) : null
  const target = briefingRoute(universeName, data, view.bodies[0]?.id)
  if (view.protocol !== 4 || !target) return null
  if (!data)
    return (
      <section className={styles.briefingProgress} aria-label="Briefing status">
        <Text role={error ? 'alert' : 'status'}>
          {error ? 'Briefing is unavailable.' : 'Receiving your briefing…'}
        </Text>
        <div className={styles.actions}>
          {error && (
            <Button
              variant="secondary"
              size="small"
              aria-label="Retry briefing"
              onClick={retry}
            >
              Retry
            </Button>
          )}
          <ButtonLink {...target} variant="secondary" size="small">
            Briefing
          </ButtonLink>
        </div>
      </section>
    )
  if (!progress) return null
  if (progress.completed > 0)
    return (
      <section
        className={styles.briefingProgress}
        aria-label="Briefing progress"
      >
        <div>
          <Heading level={2}>
            Step {progress.step} of {progress.total} · {progress.title}
          </Heading>
          <Text>
            {progress.remaining} {progress.remaining === 1 ? 'step' : 'steps'}{' '}
            remaining
          </Text>
        </div>
        <BriefingLink />
      </section>
    )
  return (
    <section className={styles.welcome} aria-label="Your advisor">
      <Orbit size={28} aria-hidden="true" />
      <div>
        <Heading level={2}>Your next step is in your briefing.</Heading>
        <Text>
          I’ll help you get this colony running. Your briefing is always here
          when you need a heading.
        </Text>
      </div>
      <ButtonLink {...target}>
        Read your briefing <ArrowRight size={16} aria-hidden="true" />
      </ButtonLink>
    </section>
  )
}
