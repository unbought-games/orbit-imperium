import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { actionLabel, visibleAction } from '../ui/action-announcements'
import { Button } from '../ui/button'
import { Section } from '../ui/section'
import { Heading } from '../ui/typography'
import styles from './order-recovery.module.css'

export function OrderRecovery({ model }: { model: Coordinator }) {
  const state = useStore(model.store)
  const orders = [...state.attempts].filter(
    ([key, attempt]) =>
      state.hiddenOrderNotices.has(key) &&
      attempt.status === 'uncertain' &&
      visibleAction(attempt),
  )
  if (!orders.length) return null
  return (
    <Section aria-labelledby="order-recovery-heading">
      <Heading level={2} id="order-recovery-heading">
        Orders awaiting confirmation
      </Heading>
      <ul className={styles.orders} role="list">
        {orders.map(([key, { envelope }]) => (
          <li key={key}>
            <span>{actionLabel(envelope.command)}</span>
            <Button
              type="button"
              variant="secondary"
              aria-label={`Retry order for ${actionLabel(envelope.command)}`}
              disabled={state.now < state.retryAt}
              onClick={(event) => {
                event.currentTarget
                  .closest('main')
                  ?.querySelector('h1')
                  ?.focus({ preventScroll: true })
                void model.retryOrder(envelope.command_id)
              }}
            >
              Retry order
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
