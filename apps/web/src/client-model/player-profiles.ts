import { createStore } from 'zustand/vanilla'
import type {
  PlayerDisplay,
  PlayerProfiles,
  ProfileSource,
} from '../adapters/player-profiles'

type State = { players: Record<string, PlayerDisplay>; now: number }
type Watch = {
  source: ProfileSource
  count: number
  timer?: ReturnType<typeof setTimeout>
  request?: AbortController
}
export const currentPlayer = (state: State, player: string) => {
  const value = state.players[player]
  return value && value.expires_at * 1000 > state.now ? value : undefined
}

/** Shared source snapshots, with display derived at the snapshot's expiry. */
export class PlayerProfilesController {
  readonly store = createStore<State>(() => ({ players: {}, now: Date.now() }))
  private watches = new Map<string, Watch>()
  private active = false
  private generation = 0
  private expiry?: ReturnType<typeof setTimeout>
  constructor(
    private readonly api: (
      source: ProfileSource,
      signal: AbortSignal,
    ) => Promise<PlayerProfiles>,
  ) {}

  watch(source: ProfileSource) {
    const key = JSON.stringify(source)
    let entry = this.watches.get(key)
    if (!entry) {
      entry = { source, count: 0 }
      this.watches.set(key, entry)
    }
    entry.count++
    if (this.active && !entry.request && !entry.timer)
      void this.refresh(key, entry)
    return () => {
      if (--entry.count > 0) return
      clearTimeout(entry.timer)
      entry.request?.abort()
      this.watches.delete(key)
    }
  }
  start() {
    this.active = true
    for (const [key, entry] of this.watches) void this.refresh(key, entry)
    const resume = () => {
      this.store.setState({ now: Date.now() })
      if (document.visibilityState !== 'visible') return
      for (const [key, entry] of this.watches) {
        clearTimeout(entry.timer)
        entry.timer = undefined
        if (!entry.request) void this.refresh(key, entry)
      }
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      this.active = false
      this.generation++
      clearTimeout(this.expiry)
      for (const entry of this.watches.values()) {
        clearTimeout(entry.timer)
        entry.timer = undefined
        entry.request?.abort()
        entry.request = undefined
      }
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
      this.store.setState({ players: {}, now: Date.now() })
    }
  }
  private scheduleExpiry() {
    clearTimeout(this.expiry)
    const deadlines = Object.values(this.store.getState().players)
      .map((p) => p.expires_at * 1000)
      .filter((at) => at > Date.now())
    if (deadlines.length)
      this.expiry = setTimeout(
        () => {
          this.store.setState({ now: Date.now() })
          this.scheduleExpiry()
        },
        Math.min(Math.min(...deadlines) - Date.now(), 2_147_483_647),
      )
  }
  private async refresh(key: string, entry: Watch) {
    if (!this.active || entry.request) return
    const generation = this.generation
    const request = new AbortController()
    entry.request = request
    entry.timer = undefined
    let delay = 30_000
    this.store.setState({ now: Date.now() })
    try {
      const result = await this.api(entry.source, request.signal)
      if (
        !this.active ||
        generation !== this.generation ||
        this.watches.get(key) !== entry
      )
        return
      const now = Date.now()
      this.store.setState((state) => {
        const players = { ...state.players }
        // Bound the cache to current snapshots, keeping no old-account or expired data.
        for (const [id, old] of Object.entries(players))
          if (old.expires_at * 1000 <= now) delete players[id]
        for (const next of result.players) {
          const old = players[next.player]
          if (
            next.expires_at * 1000 > now &&
            (!old || next.observed_at >= old.observed_at)
          )
            players[next.player] = next
        }
        return { players, now }
      })
      delay = Math.max(
        1000,
        Math.min(
          60_000,
          ...result.players.map((p) => p.expires_at * 1000 - now),
        ),
      )
      this.scheduleExpiry()
    } catch {
      // Names remain usable without Accounts; existing badges live only until expiry.
    } finally {
      if (
        this.active &&
        generation === this.generation &&
        this.watches.get(key) === entry &&
        entry.request === request
      ) {
        entry.request = undefined
        entry.timer = setTimeout(() => void this.refresh(key, entry), delay)
      }
    }
  }
}
