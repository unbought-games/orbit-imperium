import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import { readSharedReport, type SharedReport } from '../adapters/report-sharing'
import { ReportObservation } from './report-observation'
import { Button } from '../ui/button'
import { Heading, Text } from '../ui/typography'
import styles from './report-sharing.module.css'
export function SharedReportPage({ token }: { token: string }) {
  const [store] = useState(() =>
    createStore<{ report: SharedReport | null }>(() => ({ report: null })),
  )
  const report = useStore(store, (s) => s.report)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    store.setState({ report: null })
    setError('')
    void readSharedReport(token, controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) store.setState({ report })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : 'Report unavailable.',
          )
      })
    return () => controller.abort()
  }, [store, token, retry])
  return (
    <main id="main-content" className={styles.publicPage}>
      <a href="/" className={styles.brand}>
        Orbit Imperium
      </a>
      <Heading level={1}>Shared report</Heading>
      {error ? (
        <>
          <Text role="alert">{error}</Text>
          <Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>
        </>
      ) : report ? (
        <>
          <Text>
            Report {report.report} ·{' '}
            <time dateTime={new Date(report.observed_at).toISOString()}>
              {new Date(report.observed_at).toLocaleString()}
            </time>
          </Text>
          <Text>
            Published from one player’s observation.{' '}
            {report.options.include_identity
              ? 'Names recorded at publication.'
              : 'Player and planet names hidden.'}{' '}
            {report.options.include_coordinates
              ? 'Target coordinates included.'
              : 'Target coordinates hidden.'}{' '}
            “Your” refers to the publishing player.
          </Text>
          <ReportObservation
            payload={report.payload}
            playerNames={report.player_names}
            playerAlliances={report.player_alliances}
            shared
          />
        </>
      ) : (
        <Text role="status">Loading shared report…</Text>
      )}
    </main>
  )
}
