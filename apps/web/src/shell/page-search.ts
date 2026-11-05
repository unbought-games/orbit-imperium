export function validateMessagesSearch(search: Record<string, unknown>): {
  player?: string
} {
  if (search.player === undefined) return {}
  if (
    typeof search.player !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      search.player,
    )
  )
    throw new Error('This address contains an invalid player.')
  return { player: search.player }
}

export { allianceSearch as validateAllianceSearch } from '../client-model/recruitment'

/** Keep page context while removing the retired funding-planet query. */
export function withoutBodySearch(
  search: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(search).filter(([key]) => key !== 'body'),
  )
}
