import { MessagePlayerLink } from './social/message-player-link'
import { EmptyState } from '../ui/empty-state'
import { useEffect, useLayoutEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Search, Trophy } from 'lucide-react'
import { bindingKey } from '../client-model/commands'
import type { Coordinator } from '../client-model/coordinator'
import {
  rankingPageSize,
  rankMovement,
  type RankingPlayer,
  type RankedRow,
} from '../client-model/rankings'
import { useGameSession } from '../shell/session-context'
import { useProfileSource } from '../shell/player-profiles-context'
import { Button } from '../ui/button'
import { Field, Input } from '../ui/form'
import { PlayerName } from './player-name'
import { AllianceTag } from './player-alliance'
import { useRankings } from './use-rankings'
import styles from './high-scores.module.css'

const number = (value: string | number) => BigInt(value).toLocaleString()
const baselineTime = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
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
  const { rows } = ranking.window
  const allianceMode = ranking.scope === 'alliances'
  const { count, start } = allianceMode
    ? ranking.allianceWindow
    : ranking.window
  const visibleCount = allianceMode
    ? ranking.allianceWindow.rows.length
    : rows.length
  useProfileSource(
    ranking.data && !allianceMode
      ? { type: 'Rankings', players: rows.map((p) => p.player) }
      : null,
  )
  const opener = useRef<HTMLButtonElement | null>(null)
  const search = useRef<HTMLInputElement | null>(null)
  const ownPlayer = useRef<HTMLButtonElement | null>(null)
  const table = useRef<HTMLTableElement | null>(null)
  useEffect(() => {
    if (ranking.selectedId && !ranking.selected) {
      ranking.select(null)
      table.current?.focus({ preventScroll: true })
    }
  }, [ranking.selectedId, ranking.selected, ranking.select])
  const browse = (offset: number) => {
    ranking.browse(offset)
    requestAnimationFrame(() => {
      table.current?.focus({ preventScroll: true })
      table.current?.scrollIntoView({ block: 'start' })
    })
  }
  const aroundMe = () => {
    ranking.aroundMe()
    requestAnimationFrame(() => {
      const target = allianceMode
        ? table.current?.querySelector<HTMLAnchorElement>('tr[data-self] a')
        : ownPlayer.current
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'center' })
    })
  }
  return (
    <section className={styles.screen} aria-label="Universe rankings">
      <div className={styles.scopes} role="group" aria-label="Ranking category">
        <Button
          variant="secondary"
          aria-pressed={!allianceMode}
          onClick={() => ranking.switchScope('players')}
        >
          Players
        </Button>
        <Button
          variant="secondary"
          aria-pressed={allianceMode}
          onClick={() => ranking.switchScope('alliances')}
        >
          Alliances
        </Button>
      </div>
      <div className={styles.summary}>
        <div>
          <span className={styles.eyebrow}>
            <Trophy size={17} aria-hidden="true" /> Total score
          </span>
          <p>Build your empire. Find your place in the universe.</p>
        </div>
        {ranking.ownRow && (
          <p className={styles.myRank}>
            {allianceMode ? 'Your alliance rank' : 'Your rank'}{' '}
            <strong>#{number(ranking.ownRow.rank)}</strong>
            <span>{number(ranking.ownRow.points)} points</span>
            <span className={styles.myChange}>
              Change{' '}
              <RankMovement
                row={ranking.ownRow}
                baselineAt={ranking.baselineAt}
              />
            </span>
          </p>
        )}
      </div>
      <div className={styles.toolbar}>
        <Field className={styles.search}>
          <span>{allianceMode ? 'Find an alliance' : 'Find a player'}</span>
          <Input
            ref={search}
            type="search"
            value={ranking.search}
            placeholder={
              allianceMode
                ? 'Search alliance names or tags'
                : 'Search player names'
            }
            maxLength={200}
            onChange={(e) => ranking.filter(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          onClick={ranking.top}
          disabled={!ranking.data}
        >
          {allianceMode ? 'Top alliances' : 'Top players'}
        </Button>
        <Button
          variant="secondary"
          onClick={aroundMe}
          disabled={!ranking.ownRow}
        >
          {allianceMode ? 'Around my alliance' : 'Around me'}
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
          · {number(ranking.total)} {ranking.scope}. Refresh to update.
        </p>
      )}
      {ranking.data && (
        <p className={styles.timestamp}>
          {ranking.baselineAt != null ? (
            <>
              Rank change since yesterday’s first snapshot (UTC day):{' '}
              <time dateTime={new Date(ranking.baselineAt).toISOString()}>
                {baselineTime(ranking.baselineAt)}
              </time>
              . Positive means up the rankings.
            </>
          ) : (
            'Rank changes unavailable: no snapshot from yesterday (UTC day). Daily history begins when someone opens High Scores.'
          )}
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
          <table className={styles.table} ref={table} tabIndex={-1}>
            <caption className={styles.caption}>
              {allianceMode
                ? 'Universe alliance total-score rankings'
                : 'Universe total-score rankings'}
            </caption>
            <thead>
              <tr>
                <th scope="col">
                  Rank <span className={styles.changeHeading}>Change</span>
                </th>
                <th scope="col">{allianceMode ? 'Alliance' : 'Player'}</th>
                <th scope="col">
                  Points
                  {allianceMode && (
                    <span className={styles.changeHeading}>Average</span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {allianceMode
                ? ranking.allianceWindow.rows.map((row) => (
                    <tr
                      key={row.alliance.id}
                      data-self={
                        row.alliance.id === ranking.myAlliance?.alliance.id ||
                        undefined
                      }
                    >
                      <td className={styles.rank}>
                        {number(row.rank)}
                        <RankMovement
                          row={row}
                          baselineAt={ranking.baselineAt}
                        />
                      </td>
                      <td>
                        <a
                          className={styles.allianceName}
                          href={`/alliances/${encodeURIComponent(row.alliance.universe)}/${encodeURIComponent(row.alliance.id)}`}
                        >
                          [{row.alliance.tag}] {row.alliance.name}
                        </a>
                        <span className={styles.memberCount}>
                          {number(row.member_count)}{' '}
                          {row.member_count === 1 ? 'member' : 'members'}
                        </span>
                        {row.alliance.id ===
                          ranking.myAlliance?.alliance.id && (
                          <span className={styles.you}>Your alliance</span>
                        )}
                      </td>
                      <td className={styles.points}>
                        {number(row.points)}
                        <span
                          className={styles.average}
                          aria-label={`Average ${number(row.average_points)} points per member`}
                        >
                          {number(row.average_points)}
                        </span>
                      </td>
                    </tr>
                  ))
                : rows.map((row) => (
                    <tr
                      key={row.player}
                      data-self={row.player === player || undefined}
                    >
                      <td className={styles.rank}>
                        {number(row.rank)}
                        <RankMovement
                          row={row}
                          baselineAt={ranking.baselineAt}
                        />
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          className={styles.player}
                          ref={row.player === player ? ownPlayer : undefined}
                          onClick={(e) => {
                            opener.current = e.currentTarget
                            ranking.select(row.player)
                          }}
                        >
                          <PlayerName
                            player={row.player}
                            fallback={row.username}
                            alliance={null}
                            linkAlliance={false}
                          />
                        </Button>
                        {row.alliance && (
                          <AllianceTag alliance={row.alliance} />
                        )}
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
            <EmptyState
              role="status"
              variant="compact"
              icon={ranking.search.trim() ? Search : Trophy}
              title={
                ranking.search.trim()
                  ? `No ${ranking.scope} match “${ranking.search.trim()}”.`
                  : `No ${ranking.scope} are ranked yet.`
              }
              description={
                ranking.search.trim()
                  ? `Try another name or clear your search to see all ${ranking.scope}.`
                  : 'Rankings will appear as players establish their empires.'
              }
              actions={
                ranking.search.trim() ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      ranking.filter('')
                      search.current?.focus()
                    }}
                  >
                    Clear search
                  </Button>
                ) : undefined
              }
            />
          )}
          <nav className={styles.pagination} aria-label="Ranking pages">
            <Button
              variant="secondary"
              disabled={start === 0}
              onClick={() => browse(Math.max(0, start - rankingPageSize))}
            >
              Previous
            </Button>
            <span role="status">
              {count
                ? `${number(start + 1)}–${number(start + visibleCount)} of ${number(count)}`
                : `0 ${ranking.scope}`}
            </span>
            <Button
              variant="secondary"
              disabled={start + visibleCount >= count}
              onClick={() => browse(start + rankingPageSize)}
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
          Alliance points sum the exact asset values of current members before
          rounding down. Average points use that exact total divided by member
          count, then round down. Membership changes affect current totals;
          yesterday’s ranks use yesterday’s memberships.
        </p>
        <p>
          Equal whole points share a rank. For example: 1, 1, 3. Search results
          keep their universe rank and movement. Change compares shared ranks,
          including ties, with yesterday’s first observed snapshot (UTC day).
          New means the player or alliance was absent from that snapshot; 0
          means unchanged. No observation yesterday means no comparison today.
          Daily snapshots record committed updates and may include activity
          still waiting to process.
        </p>
      </details>
      {ranking.selected && (
        <RankingDetails
          row={ranking.selected}
          baselineAt={ranking.baselineAt}
          onClose={() => {
            ranking.select(null)
            const target = opener.current?.isConnected
              ? opener.current
              : table.current
            target?.focus({ preventScroll: true })
          }}
        />
      )}
    </section>
  )
}

function RankMovement({
  row,
  baselineAt,
}: {
  row: RankedRow
  baselineAt?: number | null
}) {
  const movement = rankMovement(row, baselineAt)
  return (
    <span
      className={styles.movement}
      data-direction={movement.direction}
      role="img"
      aria-label={movement.label}
      title={movement.label}
    >
      {movement.text}
    </span>
  )
}

function RankingDetails({
  row,
  baselineAt,
  onClose,
}: {
  row: RankingPlayer
  baselineAt?: number | null
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const title = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    element?.showModal()
    closeButton.current?.focus()
    return () => {
      if (element?.open) element.close()
    }
  }, [])
  return createPortal(
    <dialog
      className={styles.dialog}
      ref={dialog}
      aria-labelledby={title}
      onClose={() => {
        // Ignore a close event queued by an earlier effect cleanup if a strict
        // effect replay has already reopened this same element.
        if (!dialog.current?.open) onClose()
      }}
    >
      <h2 id={title}>
        <PlayerName
          player={row.player}
          fallback={row.username}
          alliance={row.alliance ?? null}
        />
      </h2>
      <MessagePlayerLink player={row.player} name={row.username} />
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
      <p>
        Rank change: <RankMovement row={row} baselineAt={baselineAt} />
      </p>
      {baselineAt != null && (
        <p>
          Compared with yesterday’s first snapshot (UTC day),{' '}
          {baselineTime(baselineAt)}.
        </p>
      )}
      <p>From the ranking snapshot currently displayed.</p>
      <p>{scoring}</p>
      <Button
        ref={closeButton}
        variant="secondary"
        onClick={() => dialog.current?.close()}
      >
        Close
      </Button>
    </dialog>,
    document.body,
  )
}
