import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Share2, X } from 'lucide-react'
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
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      close.current?.focus()
    }
  }, [open])
  return (
    <>
      <Button
        ref={opener}
        variant="ghost"
        size="icon"
        aria-label="Share report"
        title="Share report"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Share2 size={16} aria-hidden="true" />
      </Button>
      {open &&
        runtime.status === 'authenticated' &&
        createPortal(
          <dialog
            ref={dialog}
            className={styles.dialog}
            aria-labelledby={titleId}
            onClose={() => {
              setOpen(false)
              if (opener.current?.isConnected)
                opener.current.focus({ preventScroll: true })
            }}
          >
            <div className={styles.dialogHeader}>
              <h2 id={titleId}>Share an unlisted report</h2>
              <Button
                ref={close}
                variant="ghost"
                size="icon"
                aria-label="Close sharing"
                onClick={() => dialog.current?.close()}
              >
                <X size={18} aria-hidden="true" />
              </Button>
            </div>
            <ShareSettings
              key={report}
              model={model}
              report={report}
              csrf={runtime.session.csrf}
            />
          </dialog>,
          document.body,
        )}
    </>
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
      <Text>
        Anyone with the link can read and forward it without signing in. It
        includes the report time, battle numbers or revealed intelligence.
        Unknown sections stay unknown; fleet IDs and return times are excluded.
      </Text>
      <Text>
        Names and coordinates are hidden by default. Readers may still recognize
        a battle from its numbers. Revoking the link stops future access, but
        cannot remove copies or link previews already cached by chat services.
        Sharing automatically stars the report to protect it from archiving;
        stopping sharing keeps it starred. Archiving preserves the link.
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
