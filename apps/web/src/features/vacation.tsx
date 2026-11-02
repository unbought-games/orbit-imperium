import { useEffect, useRef, useState } from 'react'
import type { components } from '../contracts'
import { useGameScreen } from '../shell/screen-context'
import { routeTarget } from '../shell/route-target'
import { Button } from '../ui/button'
import { Link } from '../ui/link'
import { Section } from '../ui/section'
import { Heading, Text } from '../ui/typography'
import { bodyName, coordinates } from '../ui/format'
import { useVacation } from './use-vacation'
import styles from './vacation.module.css'

const blockerNames = {
  Fleet: 'Wait for your fleets to finish their missions and return.',
  Missile: 'Wait for your missiles in flight to reach their targets.',
  Construction: 'Finish or cancel construction.',
  Research: 'Finish or cancel research.',
  Manufacturing: 'Finish all queued shipyard and defense orders.',
  HostedFleet: 'Wait for allied fleets holding here to depart.',
}

export function VacationSettings() {
  const { model, view, universeName } = useGameScreen()
  const action = useVacation(model)
  const [review, setReview] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  const vacation = action.vacation
  useEffect(() => {
    if (vacation?.active) setReview(false)
  }, [vacation?.active])
  if (view.protocol !== 4) return null
  return (
    <Section aria-label="Vacation mode" className={styles.settings}>
      <Heading level={2}>Vacation mode</Heading>
      {!vacation?.active && (
        <>
          <Text>
            Pause your empire in {universeName} for at least 48 real-time hours.
            Vacation ends only when you leave.
          </Text>
          <Text>
            New missions to your planets are blocked. Already-launched attacks
            still arrive. Only base resource income continues; your production
            settings are preserved.
          </Text>
          <Text>
            Vacation protects this empire from inactivity cleanup. A deletion
            you requested still happens on its scheduled date.
          </Text>
        </>
      )}
      {!vacation ? (
        <Text role="status">
          Vacation status is unavailable. Reconnect to try again.
        </Text>
      ) : vacation.active ? (
        <>
          <Text>
            Vacation mode is active in {universeName}. Only base income
            continues. Your production settings are preserved.
          </Text>
          <Text>
            New missions to your planets are blocked. Already-launched attacks
            still arrive. You can read reports and send messages.
          </Text>
          <Text>
            Inactivity cleanup is suspended. A deletion you requested keeps its
            scheduled date.
          </Text>
          {vacation.earliest_exit_at !== null && (
            <Text>
              You can leave from{' '}
              <time
                dateTime={new Date(vacation.earliest_exit_at).toISOString()}
              >
                {new Date(vacation.earliest_exit_at).toLocaleString()}
              </time>
              .
            </Text>
          )}
          <Button
            disabled={!action.ready || action.pending || !action.canExit}
            onClick={() => void action.submit(false)}
          >
            Leave vacation mode
          </Button>
        </>
      ) : (
        <>
          {vacation.blockers.length > 0 && (
            <>
              <Text>Before entering vacation:</Text>
              <ul className={styles.blockers}>
                {vacation.blockers.map((blocker, index) => {
                  const body = view.bodies.find((b) => b.id === blocker.body)
                  return (
                    <li key={`${blocker.kind}:${blocker.body}:${index}`}>
                      {blockerNames[blocker.kind]}{' '}
                      <Link
                        {...routeTarget(
                          universeName,
                          blocker.kind === 'Research'
                            ? 'research'
                            : blocker.body
                              ? 'overview'
                              : 'fleets',
                          blocker.body ?? view.bodies[0]?.id,
                        )}
                      >
                        {body
                          ? `${bodyName(body)} ${coordinates(body)}`
                          : blocker.kind === 'Research'
                            ? 'Open research'
                            : 'Open fleets'}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
          {review ? (
            <div className={styles.review}>
              <Heading level={3}>Ready for a break?</Heading>
              <Text>
                You cannot resume gameplay for 48 hours after entering. Existing
                inbound missions continue, including attacks and allied holds.
              </Text>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  disabled={action.pending}
                  autoFocus
                  onClick={() => {
                    setReview(false)
                    requestAnimationFrame(() => opener.current?.focus())
                  }}
                >
                  Keep playing
                </Button>
                <Button
                  disabled={
                    !action.ready ||
                    action.pending ||
                    vacation.blockers.length > 0
                  }
                  onClick={() => void action.submit(true)}
                >
                  {action.pending
                    ? 'Entering vacation…'
                    : 'Confirm vacation mode'}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              disabled={
                !action.ready || action.pending || vacation.blockers.length > 0
              }
              ref={opener}
              onClick={() => setReview(true)}
            >
              Enter vacation mode
            </Button>
          )}
        </>
      )}
      {action.error && <Text role="alert">{action.error}</Text>}
      {action.message && (
        <Text role={action.failed ? 'alert' : 'status'}>{action.message}</Text>
      )}
    </Section>
  )
}

export function VacationNotice({
  vacation,
  universeName,
}: {
  vacation?: components['schemas']['VacationView4']
  universeName: string
}) {
  if (!vacation?.active) return null
  return (
    <Section aria-label="Vacation active" className={styles.notice}>
      <Text>
        Vacation mode · Base income only. Already-launched attacks still arrive.{' '}
        <Link {...routeTarget(universeName, 'settings')}>
          Manage vacation in Settings
        </Link>
      </Text>
    </Section>
  )
}
