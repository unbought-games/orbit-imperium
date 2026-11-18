// UUIDv7 stores Unix milliseconds in its first 48 bits. Keep request IDs,
// entities and game ordering on their existing generators and clocks.
export const commandWindowMs = 15 * 60 * 1000
export const futureSkewMs = 30_000
export function timestampedCommandId(entropy: string, atMs: number) {
  const ms = Math.floor(atMs)
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48)
    throw Error('Invalid command clock')
  const time = ms.toString(16).padStart(12, '0')
  return time.slice(0, 8) + '-' + time.slice(8) + '-7' + entropy.slice(15)
}

export function presenceCommandId(gameplayId: string) {
  const last = Number.parseInt(gameplayId.slice(-1), 16)
  return gameplayId.slice(0, -1) + (last ^ 1).toString(16)
}

export function commandTime(id: string): number | null {
  if (
    !/^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
      id,
    )
  )
    return null
  return Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
}

export function commandWindowError(id: string, now: number) {
  const at = commandTime(id)
  if (at === null) return 'COMMAND_ID_UNSUPPORTED'
  if (at > now + futureSkewMs) return 'COMMAND_IN_FUTURE'
  return now >= at + commandWindowMs ? 'COMMAND_EXPIRED' : null
}

export function withinCommandWindow(id: string, now: number) {
  return commandWindowError(id, now) === null
}

const statusOf = (error: unknown) =>
  typeof error === 'object' && error && 'status' in error
    ? Number(error.status)
    : 0
export function unavailableCommandAccess(error: unknown) {
  return [401, 403, 404].includes(statusOf(error))
}
export const unknownAccessMessage =
  'Access changed while checking the earlier request. Its outcome is unknown. Sign in again and check the current state.'
export function definiteMutationResponse(error: unknown, recovering = false) {
  const status = statusOf(error)
  return (
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429 &&
    !(recovering && unavailableCommandAccess(error))
  )
}

export function identityProblem(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  switch (error.code) {
    case 'COMMAND_EXPIRED':
    case 'COMMAND_HISTORY_EXPIRED':
      return expiredOrderMessage
    case 'COMMAND_IN_FUTURE':
      return 'This order is ahead of the server clock. Its earlier outcome is unknown. Check the current state before placing another order.'
    case 'COMMAND_ID_UNSUPPORTED':
      return 'This order uses an unsupported ID. Its earlier outcome is unknown. Reload the app and check the current state.'
    default:
      return null
  }
}

export const expiredOrderMessage =
  'The retry window closed. The earlier action may have completed. Check the current state before placing another order.'
