import type { components } from '../contracts'
import type { GameState } from '../client-model/game-store'
import { activeAttempt } from '../client-model/game-projection'
type S = components['schemas']
export function jumpShips(body: S['BodyV3'], catalog: S['CatalogEntry3'][]) {
  return body.inventories
    .flatMap((entry) =>
      entry.item.kind === 'Ship' &&
      BigInt(entry.count) > 0n &&
      catalog.some(
        (c) =>
          c.key.kind === 'Ship' &&
          c.key.id === entry.item.id &&
          c.enabled &&
          c.mobile,
      )
        ? [{ ship_type: entry.item.id, count: entry.count }]
        : [],
    )
    .sort((a, b) => a.ship_type.localeCompare(b.ship_type))
}
export function jumpSelection(
  source: S['BodyV3'],
  destination: string,
  player: string,
  quantities: Record<string, string>,
  catalog: S['CatalogEntry3'][],
) {
  const ships: S['ManifestStack4'][] = []
  for (const available of jumpShips(source, catalog)) {
    const text = quantities[available.ship_type]?.trim() || '0'
    if (!/^[0-9]+$/.test(text) || text.length > 19) return null
    const count = BigInt(text)
    if (count > BigInt(available.count)) return null
    if (count > 0n)
      ships.push({
        owner: player,
        ship_type: available.ship_type,
        count: count.toString(),
      })
  }
  // Reject stale edits for ships that disappeared instead of silently shrinking the selection.
  if (
    Object.entries(quantities).some(([id, count]) => {
      const text = count.trim()
      return (
        text !== '' &&
        (!/^[0-9]+$/.test(text) ||
          text.length > 19 ||
          (BigInt(text) > 0n && !ships.some((s) => s.ship_type === id)))
      )
    })
  )
    return null
  return ships.length && destination && source.id !== destination
    ? { source: source.id, destination, ships }
    : null
}
export function pendingJump(state: GameState, body: string) {
  return [...state.attempts.values()].reverse().find((a) => {
    const c = a.envelope.command
    return (
      c.type === 'World' &&
      c.action.type === 'JumpShips' &&
      (c.action.intent.source === body ||
        c.action.intent.destination === body) &&
      activeAttempt(a, state.view)
    )
  })
}
