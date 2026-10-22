export type PlayerNames = Readonly<Record<string, string>>

export function playerLabel(player: unknown, names?: PlayerNames): string {
  if (typeof player !== 'string' || !player.trim()) return 'Unknown player'
  const name = names && Object.hasOwn(names, player) ? names[player] : undefined
  return name?.trim() || `Player ${player.slice(0, 8)}`
}
