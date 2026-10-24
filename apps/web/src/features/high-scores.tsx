import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Trophy } from 'lucide-react'
import { bindingKey } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import { rankingPageSize, type RankingPlayer } from '../client-model/rankings'
import { useGameSession } from '../shell/session-context'
import { useProfileSource } from '../shell/player-profiles-context'
import { Button } from '../ui/button'
import { Field, Input } from '../ui/form'
import { PlayerName } from './player-name'
import { useRankings } from './use-rankings'
import styles from './high-scores.module.css'

const number = (value: string | number) => BigInt(value).toLocaleString()
const scoring =
  'One point for every 1,000 resources invested in completed buildings, research, ships, and defenses. Ships in flight still count. Stockpiles, cargo, fuel, and unfinished work do not. Lost or consumed assets reduce your score.'

export function HighScoresScreen() {
  const { model, view } = useGameSession()
  return (
    <HighScores
      key={bindingKey(view.binding)}
      model={model}
      player={view.binding.player}
    />
  )
}

function HighScores({ model, player }: { model: Coordinator; player: string }) {
  const ranking = useRankings(model, player)
  const { rows, count, start } = ranking.window
  useProfileSource(
    ranking.data
      ? { type: 'Rankings', players: rows.map((p) => p.player) }
      : null,
  )
  const opener = useRef<HTMLButtonElement | null>(null)
  return (
    <section className={styles.screen} aria-label="Universe rankings">
      <div className={styles.summary}>
        <div>
          <span className={styles.eyebrow}>
            <Trophy size={17} aria-hidden="true" /> Total score
          </span>
          <p>Build your empire. Find your place in the universe.</p>
        </div>
        {ranking.me && (
          <p className={styles.myRank}>
            Your rank <strong>#{number(ranking.me.rank)}</strong>
            <span>{number(ranking.me.points)} points</span>
          </p>
        )}
      </div>
      <div className={styles.toolbar}>
        <Field className={styles.search}>
          <span>Find a player</span>
          <Input
            type="search"
            value={ranking.search}
            placeholder="Search player names"
            maxLength={200}
            onChange={(e) => ranking.filter(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          onClick={ranking.top}
          disabled={!ranking.data}
        >
          Top players
        </Button>
        <Button
          variant="secondary"
          onClick={ranking.aroundMe}
          disabled={!ranking.me}
        >
          Around me
        </Button>
        <Button
          variant="secondary"
          onClick={ranking.refresh}
          disabled={ranking.loading}
        >
          {ranking.loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      {ranking.error && (
        <p role="alert">
          {ranking.error} {ranking.data && 'Showing the previous snapshot.'}
        </p>
      )}
      {ranking.data && (
        <p className={styles.timestamp}>
          Snapshot:{' '}
          <time dateTime={new Date(ranking.data.sampled_at).toISOString()}>
            {new Date(ranking.data.sampled_at).toLocaleString()}
          </time>{' '}
          · {number(ranking.data.players.length)} players. Refresh to update.
        </p>
      )}
      {ranking.data?.processing_pending && (
        <p role="status">
          The universe is processing queued activity. These scores include
          completed updates only.
        </p>
      )}
      {!ranking.data && (
        <p role="status">
          {ranking.loading
            ? 'Loading universe rankings…'
            : 'Rankings unavailable.'}
        </p>
      )}
      {ranking.data && (
        <>
          <table className={styles.table}>
            <caption className={styles.caption}>
              Universe total-score rankings
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Player</th>
                <th scope="col">Points</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.player}
                  data-self={row.player === player || undefined}
                >
                  <td className={styles.rank}>{number(row.rank)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      className={styles.player}
                      onClick={(e) => {
                        opener.current = e.currentTarget
                        ranking.select(row.player)
                      }}
                    >
                      <PlayerName player={row.player} fallback={row.username} />
                    </Button>
                    {row.player === player && (
                      <span className={styles.you}>You</span>
                    )}
                  </td>
                  <td className={styles.points}>{number(row.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!count && (
            <p role="status">
              {ranking.search.trim()
                ? `No players match “${ranking.search.trim()}”.`
                : 'No players are ranked yet.'}
            </p>
          )}
          <nav className={styles.pagination} aria-label="Ranking pages">
            <Button
              variant="secondary"
              disabled={start === 0}
              onClick={() =>
                ranking.browse(Math.max(0, start - rankingPageSize))
              }
            >
              Previous
            </Button>
            <span role="status">
              {count
                ? `${number(start + 1)}–${number(start + rows.length)} of ${number(count)}`
                : '0 players'}
            </span>
            <Button
              variant="secondary"
              disabled={start + rows.length >= count}
              onClick={() => ranking.browse(start + rankingPageSize)}
            >
              Next
            </Button>
          </nav>
        </>
      )}
      <details className={styles.explanation}>
        <summary>How scores work</summary>
        <p>{scoring}</p>
        <p>
          Equal whole points share a rank. For example: 1, 1, 3. Search results
          keep their universe rank.
        </p>
      </details>
      {ranking.selected && (
        <RankingDetails
          row={ranking.selected}
          onClose={() => {
            ranking.select(null)
            opener.current?.focus({ preventScroll: true })
          }}
        />
      )}
    </section>
  )
}

function RankingDetails({
  row,
  onClose,
}: {
  row: RankingPlayer
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  return createPortal(
    <dialog
      className={styles.dialog}
      ref={dialog}
      aria-labelledby={title}
      onClose={onClose}
    >
      <h2 id={title}>
        <PlayerName player={row.player} fallback={row.username} />
      </h2>
      <dl className={styles.stats}>
        <div>
          <dt>Universe rank</dt>
          <dd>#{number(row.rank)}</dd>
        </div>
        <div>
          <dt>Total points</dt>
          <dd>{number(row.points)}</dd>
        </div>
      </dl>
      <p>From the ranking snapshot currently displayed.</p>
      <p>{scoring}</p>
      <Button variant="secondary" onClick={() => dialog.current?.close()}>
        Close
      </Button>
    </dialog>,
    document.body,
  )
}
