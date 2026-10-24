import { createStore } from 'zustand/vanilla'
import type { Rankings } from './commands'

export type RankingPlayer = Rankings['players'][number]
export const rankingPageSize = 50

export function rankingWindow(
  players: RankingPlayer[],
  search: string,
  offset: number,
) {
  const term = search.trim().normalize('NFKC').toLocaleLowerCase()
  const matches = term
    ? players.filter((p) =>
        p.username.normalize('NFKC').toLocaleLowerCase().includes(term),
      )
    : players
  const start = Math.min(Math.max(0, offset), Math.max(0, matches.length - 1))
  return {
    rows: matches.slice(start, start + rankingPageSize),
    start,
    count: matches.length,
  }
}

export function aroundPlayer(players: RankingPlayer[], player: string) {
  const index = players.findIndex((p) => p.player === player)
  return Math.max(
    0,
    Math.min(
      index - Math.floor(rankingPageSize / 2),
      players.length - rankingPageSize,
    ),
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
