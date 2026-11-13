import { useState } from 'react'
import { Timestamp, type TimestampView } from '../../src/ui/timestamp'
import { Button } from '../../src/ui/button'
import styles from './timestamp.scenario.module.css'

export function TimestampScenario() {
  const [origin] = useState(() => Date.now())
  const arrival = origin + 131_000
  const [view, setView] = useState<TimestampView>('local')
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <p>COMPONENT PREVIEW</p>
        <h1>Time, in your frame of reference.</h1>
        <div>
          Click any timestamp to choose its display or copy an exact time.
        </div>
      </header>
      <div className={styles.grid}>
        <section className={styles.panel} aria-label="Fleet return">
          <h2>Fleet return</h2>
          <p className={styles.caption}>Countdown · inline</p>
          <div className={styles.fleet}>
            <span className={styles.marker}>↗</span>
            <div>
              <strong>Expedition fleet</strong>
              <div className={styles.muted}>Returning to Asterion</div>
            </div>
          </div>
          <div className={styles.hero}>
            <Timestamp
              value={arrival}
              defaultView="countdown"
              triggerProps={{ 'aria-label': 'Fleet return time' }}
            >
              {({ view, text, expired }) =>
                view === 'countdown'
                  ? expired
                    ? 'Awaiting confirmation'
                    : `Home ${text}`
                  : `Home at ${text}`
              }
            </Timestamp>
          </div>
        </section>
        <section className={styles.panel} aria-label="Report time">
          <h2>Report timestamp</h2>
          <p className={styles.caption}>Elapsed time · subtle</p>
          <p>Your expedition discovered an abandoned station.</p>
          <Timestamp
            value={origin - 300_000}
            variant="subtle"
            triggerProps={{ 'aria-label': 'Report time' }}
          />
        </section>
        <section className={styles.panel} aria-label="Absolute time examples">
          <h2>The same instant, two zones</h2>
          <p className={styles.caption}>Absolute · chip</p>
          <div className={styles.stack}>
            <div>
              <span className={styles.label}>Your local time</span>
              <Timestamp
                value={arrival}
                defaultView="local"
                variant="chip"
                triggerProps={{ 'aria-label': 'Local example' }}
              />
            </div>
            <div>
              <span className={styles.label}>Coordinated Universal Time</span>
              <Timestamp
                value={arrival}
                defaultView="utc"
                variant="chip"
                triggerProps={{ 'aria-label': 'UTC example' }}
              />
            </div>
          </div>
        </section>
        <section className={styles.panel} aria-label="Coordinated attacks">
          <h2>Coordinated arrivals</h2>
          <p className={styles.caption}>Shared selection · custom trigger</p>
          <p>Choose a view on either arrival to update both.</p>
          <div className={styles.stack}>
            <div>
              <span className={styles.label}>First wave</span>
              <Timestamp
                value={arrival}
                view={view}
                onViewChange={setView}
                triggerProps={{ 'aria-label': 'First wave' }}
              />
            </div>
            <div>
              <span className={styles.label}>
                Second wave · 3 seconds later
              </span>
              <Timestamp.Root
                value={arrival + 3000}
                view={view}
                onViewChange={setView}
              >
                <Timestamp.Trigger
                  unstyled
                  render={<Button variant="secondary" size="compact" />}
                  aria-label="Second wave"
                >
                  <Timestamp.Value />
                </Timestamp.Trigger>
                <Timestamp.Content />
              </Timestamp.Root>
            </div>
          </div>
        </section>
      </div>
      <section className={styles.states} aria-label="Boundary states">
        <div>
          <span className={styles.label}>Deadline reached</span>
          <Timestamp
            value={origin - 1000}
            defaultView="countdown"
            triggerProps={{ 'aria-label': 'Expired time' }}
          >
            {({ view, text }) =>
              view === 'countdown' ? 'Awaiting confirmation' : text
            }
          </Timestamp>
        </div>
        <div>
          <span className={styles.label}>Missing / invalid time</span>
          <Timestamp value="unavailable" />
        </div>
      </section>
    </main>
  )
}
