import type { components } from '../contracts'
import { flightDuration, flightSchedule } from '../client-model/dispatch-timing'
import { exactTime } from './mission-presentation'
import styles from './missions.module.css'

const returnTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})
export function DispatchTiming({
  terms,
  now,
  message,
}: {
  terms?: components['schemas']['FleetTerms4']
  now: number
  message?: string
}) {
  const schedule = terms
    ? flightSchedule(terms.duration_ms, now, terms.intent.mission)
    : null
  return (
    <section
      className={styles.flightTiming}
      aria-label="Flight timing"
      title="Estimated timing if sent now"
    >
      {terms && schedule ? (
        <dl>
          <div>
            <dt>To destination</dt>
            <dd title={exactTime(schedule.arrival)}>
              {flightDuration(terms.duration_ms)}
            </dd>
          </div>
          <div>
            <dt>
              {terms.intent.mission === 'Colonize'
                ? 'Back if needed'
                : 'Back at'}
            </dt>
            <dd>
              {schedule.returnAt === null ? (
                'One-way'
              ) : (
                <time
                  dateTime={new Date(schedule.returnAt).toISOString()}
                  title={exactTime(schedule.returnAt)}
                >
                  {returnTime.format(schedule.returnAt)}
                </time>
              )}
            </dd>
          </div>
          <div>
            <dt>Total flight</dt>
            <dd>{flightDuration(schedule.total)}</dd>
          </div>
        </dl>
      ) : (
        <p>{message ?? 'Updating flight times…'}</p>
      )}
    </section>
  )
}
