import { createStore } from 'zustand/vanilla'
import type {
  PlayerDisplay,
  PlayerProfiles,
  ProfileSource,
} from '../adapters/player-profiles'
import type { PlayerProfileCache } from '../adapters/player-profile-cache'

type State = { players: Record<string, PlayerDisplay>; now: number }
type Watch = {
  source: ProfileSource
  count: number
  timer?: ReturnType<typeof setTimeout>
  request?: AbortController
}
export const currentPlayer = (state: State, player: string) =>
  state.players[player]

/** Last confirmed display stays visible until replaced; expiry schedules refresh only. */
export class PlayerProfilesController {
  readonly store = createStore<State>(() => ({ players: {}, now: Date.now() }))
  private watches = new Map<string, Watch>()
  private active = false
  private generation = 0
  constructor(
    private readonly api: (
      source: ProfileSource,
      signal: AbortSignal,
    ) => Promise<PlayerProfiles>,
    private readonly cache?: PlayerProfileCache,
  ) {
    if (cache) this.store.setState({ players: cache.load() })
  }

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
  /** Refresh after a committed social change; fence all older in-flight snapshots. */
  refreshAll = () => {
    this.generation++
    this.store.setState({ now: Date.now() })
    for (const [key, entry] of this.watches) {
      clearTimeout(entry.timer)
      entry.timer = undefined
      entry.request?.abort()
      entry.request = undefined
      if (this.active) void this.refresh(key, entry)
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
        for (const next of result.players) {
          const old = players[next.player]
          if (
            next.expires_at * 1000 > now &&
            (!old ||
              old.expires_at * 1000 <= now ||
              next.observed_at >= old.observed_at)
          )
            players[next.player] = next
        }
        return { players, now }
      })
      this.cache?.save(this.store.getState().players)
      delay = Math.max(
        1000,
        Math.min(
          60_000,
          ...result.players.map((p) => p.expires_at * 1000 - now),
        ),
      )
    } catch {
      // Keep the last confirmed display through slow requests and outages.
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
