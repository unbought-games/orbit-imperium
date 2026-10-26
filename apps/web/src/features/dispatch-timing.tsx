import { ResourceQuantity } from '../ui/number-value'
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
  mission,
  now,
  message,
}: {
  terms?: components['schemas']['FleetTerms4']
  mission: components['schemas']['Mission4']
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
      <dl>
        <div>
          <dt>To destination</dt>
          <dd title={schedule ? exactTime(schedule.arrival) : undefined}>
            {terms ? flightDuration(terms.duration_ms) : '—'}
          </dd>
        </div>
        {mission !== 'Deploy' && (
          <div>
            <dt>{mission === 'Colonize' ? 'Back if needed' : 'Back at'}</dt>
            <dd>
              {schedule ? (
                schedule.returnAt === null ? (
                  'One-way'
                ) : (
                  <time
                    dateTime={new Date(schedule.returnAt).toISOString()}
                    title={exactTime(schedule.returnAt)}
                  >
                    {returnTime.format(schedule.returnAt)}
                  </time>
                )
              ) : (
                '—'
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>Total flight</dt>
          <dd>{schedule ? flightDuration(schedule.total) : '—'}</dd>
        </div>
        <div>
          <dt>Deuterium consumed</dt>
          <dd>
            {terms ? (
              <ResourceQuantity resource="deuterium" value={terms.fuel} />
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
      <p>{terms ? '' : (message ?? 'Updating flight times…')}</p>
    </section>
  )
}
