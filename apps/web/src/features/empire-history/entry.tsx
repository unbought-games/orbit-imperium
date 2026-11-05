import { useState } from 'react'
import type {
  EmpireProfile,
  HistoryEntry,
  HistoricalDetail,
  ProfileAction,
} from '../../adapters/empire-history'
import { useArchive } from '../../client-model/use-empire-history'
import { Button, ButtonLinkAnchor } from '../../ui/button'
import { ReportObservation } from '../report-observation'
import { eventDate, eventSummary, eventTitle } from './presentation'
import styles from './history.module.css'

export function BattleDetails({ event }: { event: string }) {
  const { data, error, retry } = useArchive<HistoricalDetail>(
    'HistoricalDetail',
    `/api/v4/history/${event}`,
  )
  if (error)
    return (
      <div role="alert">
        {error} <Button onClick={retry}>Retry</Button>
      </div>
    )
  if (!data) return <p role="status">Loading battle…</p>
  return data.report ? (
    <ReportObservation
      payload={data.report.payload}
      playerNames={data.report.player_names}
      playerAlliances={data.report.player_alliances}
      shared
    />
  ) : (
    <p>No additional battle observation was recorded.</p>
  )
}
function EntryEditor({
  entry,
  profile,
  save,
  busy,
}: {
  entry: HistoryEntry
  profile: EmpireProfile
  save: (profile: EmpireProfile, action: ProfileAction) => Promise<boolean>
  busy: boolean
}) {
  const [caption, setCaption] = useState<string>()
  const [featured, setFeatured] = useState<boolean>()
  const submit = async (selected: boolean) => {
    if (
      await save(profile, {
        type: 'Select',
        event: entry.id,
        selected,
        caption: caption ?? entry.caption,
        featured: featured ?? entry.featured,
      })
    ) {
      setCaption(undefined)
      setFeatured(undefined)
    }
  }
  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault()
        void submit(true)
      }}
    >
      <label>
        Your caption
        <textarea
          maxLength={2000}
          value={caption ?? entry.caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What made this moment yours?"
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={featured ?? entry.featured}
          onChange={(e) => setFeatured(e.target.checked)}
        />
        Feature this moment
      </label>
      <div className={styles.actions}>
        <Button disabled={busy} type="submit">
          {entry.selected ? 'Save changes' : 'Add to profile'}
        </Button>
        {entry.selected && (
          <Button
            variant="secondary"
            disabled={busy}
            type="button"
            onClick={() => void submit(false)}
          >
            Remove from profile
          </Button>
        )}
      </div>
    </form>
  )
}
export function TimelineEntry({
  entry,
  profile,
  editing,
  busy,
  signedIn,
  save,
}: {
  entry: HistoryEntry
  profile: EmpireProfile
  editing: boolean
  busy: boolean
  signedIn: boolean
  save: (profile: EmpireProfile, action: ProfileAction) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(false)
  const [publishing, setPublishing] = useState(false)
  return (
    <article
      className={`${styles.event} ${entry.featured ? styles.featured : ''}`}
      aria-label={eventTitle(entry)}
    >
      <div className={styles.eventHeading}>
        <time
          dateTime={
            entry.at_ms === null
              ? undefined
              : new Date(entry.at_ms).toISOString()
          }
        >
          {eventDate(entry.at_ms)}
        </time>
        {entry.noteworthy && (
          <span className={styles.distinction}>Noteworthy battle</span>
        )}
        {editing && (
          <span>{entry.selected ? 'On your profile' : 'In your history'}</span>
        )}
      </div>
      <h2>{eventTitle(entry)}</h2>
      {entry.correction && (
        <p className={styles.hint}>Record corrected: {entry.correction}</p>
      )}
      <p className={styles.summary}>{eventSummary(entry)}</p>
      {entry.caption && <p className={styles.caption}>{entry.caption}</p>}
      {entry.kind === 'Battle' && (
        <>
          <Button
            variant="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((x) => !x)}
          >
            {expanded ? 'Hide battle details' : 'Explore the battle'}
          </Button>
          {expanded && (
            <div className={styles.details}>
              <BattleDetails event={entry.id} />
            </div>
          )}
        </>
      )}
      {editing && (
        <EntryEditor entry={entry} profile={profile} save={save} busy={busy} />
      )}
      <div className={styles.actions}>
        {entry.publication ? (
          <ButtonLinkAnchor
            variant="ghost"
            href={`/commemorations/${entry.publication}`}
          >
            Open commemorative card
          </ButtonLinkAnchor>
        ) : (
          signedIn && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPublishing((x) => !x)}
            >
              Publish commemorative card
            </Button>
          )
        )}
      </div>
      {publishing && !entry.publication && (
        <div className={styles.publication}>
          <p>
            This publishes the event details and this caption to a lasting
            public link. The card stays available if the report is deleted, the
            profile is hidden, or the campaign ends.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void save(profile, { type: 'Publish', event: entry.id }).then(
                (ok) => {
                  if (ok) setPublishing(false)
                },
              )
            }}
          >
            Publish permanent card
          </Button>{' '}
          <Button variant="secondary" onClick={() => setPublishing(false)}>
            Cancel
          </Button>
        </div>
      )}
    </article>
  )
}
