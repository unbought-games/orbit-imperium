import { useState } from 'react'
import type { Coordinator } from '../client-model/coordinator'
import { useAuthSession } from '../shell/auth-context'
import { Button } from '../ui/button'
import { Text } from '../ui/typography'
import { sharedReportPath } from '../adapters/report-sharing'
import { useReportSharing } from './use-report-sharing'
import styles from './report-sharing.module.css'
export function ReportShareControl({
  model,
  report,
}: {
  model: Coordinator
  report: string
}) {
  const { runtime } = useAuthSession()
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.control}>
      <Button
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Share report
      </Button>
      {open && runtime.status === 'authenticated' && (
        <ShareSettings
          key={report}
          model={model}
          report={report}
          csrf={runtime.session.csrf}
        />
      )}
    </div>
  )
}
function ShareSettings({
  model,
  report,
  csrf,
}: {
  model: Coordinator
  report: string
  csrf: string
}) {
  const { status, busy, error, act } = useReportSharing(model, csrf, report)
  const [identity, setIdentity] = useState(false)
  const [coordinates, setCoordinates] = useState(false)
  const [feedback, setFeedback] = useState('')
  const url = status?.token
    ? new URL(sharedReportPath(status.token), window.location.origin).href
    : ''
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setFeedback('Link copied.')
    } catch {
      setFeedback('Select the link above and copy it manually.')
    }
  }
  return (
    <section className={styles.settings} aria-label="Report sharing">
      <h3>Share an unlisted report</h3>
      <Text>
        Anyone with the link can read and forward it without signing in. It
        includes the report time, battle numbers or revealed intelligence.
        Unknown sections stay unknown; fleet IDs and return times are excluded.
      </Text>
      <Text>
        Names and coordinates are hidden by default. Readers may still recognize
        a battle from its numbers. Revoking the link stops future access, but
        cannot remove copies others saved. Deleting this report revokes its
        link.
      </Text>
      {error && (
        <Text role="alert" tone="danger">
          {error}
        </Text>
      )}
      {!status || error ? (
        <Button disabled={busy} onClick={() => void act({ type: 'Status' })}>
          {busy ? 'Checking sharing…' : 'Retry sharing status'}
        </Button>
      ) : status.token ? (
        <>
          <Text>
            Shared:{' '}
            {status.options?.include_identity
              ? 'player and planet names included'
              : 'names hidden'}
            ;{' '}
            {status.options?.include_coordinates
              ? 'coordinates included'
              : 'coordinates hidden'}
            . Names are recorded at publication.
          </Text>
          <label className={styles.link}>
            Share link
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className={styles.actions}>
            <Button disabled={busy} onClick={() => void copy()}>
              Copy link
            </Button>
            <a href={url} target="_blank" rel="noreferrer">
              Preview shared report
            </a>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                setFeedback('')
                void act({ type: 'Revoke' })
              }}
            >
              Stop sharing
            </Button>
          </div>
          <Text>
            To change included information, stop sharing and create a new link.
          </Text>
        </>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={identity}
              disabled={busy}
              onChange={(e) => setIdentity(e.target.checked)}
            />{' '}
            Include player and planet names
          </label>
          <label>
            <input
              type="checkbox"
              checked={coordinates}
              disabled={busy}
              onChange={(e) => setCoordinates(e.target.checked)}
            />{' '}
            Include target coordinates
          </label>
          <Button
            disabled={busy}
            onClick={() =>
              void act({
                type: 'Create',
                options: {
                  include_identity: identity,
                  include_coordinates: coordinates,
                },
              })
            }
          >
            {busy ? 'Creating link…' : 'Create share link'}
          </Button>
        </>
      )}
      <Text role="status">{feedback}</Text>
    </section>
  )
}
