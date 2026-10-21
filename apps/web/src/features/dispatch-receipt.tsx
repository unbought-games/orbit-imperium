import { useUniverseName } from '../shell/session-context'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { actionMessage } from '../ui/action-announcements'
import { Heading, Text } from '../ui/typography'
import { Button, ButtonLink } from '../ui/button'
import { routeTarget } from '../shell/route-target'
import styles from './missions.module.css'

export function DispatchReceipt({
  model,
  origin,
}: {
  model: Coordinator
  origin: string
}) {
  const universeName = useUniverseName()
  const state = useStore(model.store)
  const latest = [...state.attempts.values()]
    .filter((attempt) => {
      const command = attempt.envelope.command
      return (
        command.type === 'World' &&
        command.action.type === 'LaunchFleet' &&
        command.action.intent.origin === origin
      )
    })
    .at(-1)
  if (!latest || !state.binding) return null
  return (
    <section className={styles.receipt} aria-label="Dispatch receipt">
      <Heading level={3}>Latest departure order</Heading>
      <Text>{actionMessage(latest)}</Text>
      {latest.status === 'uncertain' && (
        <Button onClick={() => void model.recover(latest.envelope.command_id)}>
          Resolve saved departure
        </Button>
      )}
      <ButtonLink {...routeTarget(universeName, 'fleets', origin)}>
        View fleet activity
      </ButtonLink>
    </section>
  )
}
