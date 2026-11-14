import type { Binding, PlayerDisplay } from './player-profiles'
import { validate } from '../client-model/schema'

type Players = Record<string, PlayerDisplay>
export interface PlayerProfileCache {
  load(): Players
  save(players: Players): void
}

/** Public display snapshots only, never authorization or editor eligibility.
 * Scope by the complete game binding so another account/epoch cannot inherit it.
 */
export function playerProfileCache(
  binding: Binding,
  storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => localStorage,
): PlayerProfileCache {
  const key = `orbit.player-profiles.v1:${JSON.stringify([
    binding.account,
    binding.universe,
    binding.epoch,
    binding.player,
  ])}`
  return {
    load() {
      try {
        const raw: unknown = JSON.parse(storage().getItem(key) ?? '[]')
        if (!Array.isArray(raw)) return {}
        return Object.fromEntries(
          raw.map((entry) => {
            const player = validate<PlayerDisplay>('PlayerDisplay', entry)
            return [player.player, player]
          }),
        )
      } catch {
        // Storage can be disabled, full, corrupt, or from an incompatible client.
        return {}
      }
    },
    save(players) {
      try {
        storage().setItem(key, JSON.stringify(Object.values(players)))
      } catch {
        // The session's in-memory store still works when persistence is unavailable.
      }
    },
  }
}
