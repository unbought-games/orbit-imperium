import { createStore } from 'zustand/vanilla'
import type { Rankings } from './commands'

export type RankingPlayer = Rankings['players'][number]
export type RankingAlliance = NonNullable<Rankings['alliances']>[number]
export type RankingScope = 'players' | 'alliances'
export type RankedRow = Pick<RankingPlayer, 'rank' | 'previous_rank'>
export const rankingPageSize = 50

/** Positive movement means climbing toward rank one. Missing historical members
 * are new; a missing universe baseline is not evidence of a new player. */
export function rankMovement(row: RankedRow, baselineAt?: number | null) {
  if (baselineAt == null)
    return {
      text: '—',
      label: 'Rank change unavailable: no snapshot from yesterday',
      direction: 'unknown',
    }
  if (row.previous_rank == null)
    return {
      text: 'New',
      label: 'New to the rankings since the baseline',
      direction: 'new',
    }
  const delta = row.previous_rank - row.rank
  if (delta === 0)
    return {
      text: '0',
      label: 'Rank unchanged since the baseline',
      direction: 'same',
    }
  return {
    text: `${delta > 0 ? '+' : '−'}${Math.abs(delta).toLocaleString()}`,
    label: `${delta > 0 ? 'Up' : 'Down'} ${Math.abs(delta).toLocaleString()} ${Math.abs(delta) === 1 ? 'place' : 'places'} since the baseline`,
    direction: delta > 0 ? 'up' : 'down',
  }
}

function normalized(value: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase()
}

function windowRows<T>(
  rows: T[],
  search: string,
  offset: number,
  label: (row: T) => string,
) {
  const term = normalized(search)
  const matches = term
    ? rows.filter((row) => normalized(label(row)).includes(term))
    : rows
  const start = Math.min(Math.max(0, offset), Math.max(0, matches.length - 1))
  return {
    rows: matches.slice(start, start + rankingPageSize),
    start,
    count: matches.length,
  }
}

export function rankingWindow(
  players: RankingPlayer[],
  search: string,
  offset: number,
) {
  return windowRows(players, search, offset, (row) => row.username)
}

export function allianceRankingWindow(
  alliances: RankingAlliance[],
  search: string,
  offset: number,
) {
  return windowRows(
    alliances,
    search,
    offset,
    (row) => `${row.alliance.name} [${row.alliance.tag}]`,
  )
}

function aroundIndex(length: number, index: number) {
  return Math.max(
    0,
    Math.min(index - Math.floor(rankingPageSize / 2), length - rankingPageSize),
  )
}

export function aroundPlayer(players: RankingPlayer[], player: string) {
  return aroundIndex(
    players.length,
    players.findIndex((p) => p.player === player),
  )
}

export function aroundAlliance(alliances: RankingAlliance[], alliance: string) {
  return aroundIndex(
    alliances.length,
    alliances.findIndex((a) => a.alliance.id === alliance),
  )
}

/** One retained observation, not a second live game model. Navigation derives
 * rows from this response and never reloads or re-ranks individual pages. */
export class RankingsController {
  readonly store = createStore<{
    data: Rankings | null
    loading: boolean
    error: string
  }>(() => ({ data: null, loading: false, error: '' }))
  private generation = 0
  constructor(private readonly load: () => Promise<Rankings | null>) {}
  cancel() {
    this.generation++
  }
  async refresh() {
    const generation = ++this.generation
    this.store.setState({ loading: true, error: '' })
    try {
      const data = await this.load()
      if (generation !== this.generation) return
      if (!data) throw new Error('Rankings unavailable')
      this.store.setState({ data, loading: false, error: '' })
    } catch {
      if (generation === this.generation)
        this.store.setState({
          loading: false,
          error: 'High Scores could not be refreshed. Try again.',
        })
    }
  }
}
