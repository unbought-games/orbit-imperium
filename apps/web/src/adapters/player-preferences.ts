import type { components } from '../contracts'
import type { PlayerPreferences } from '../client-model/player-preferences'
import { validate } from '../client-model/schema'
import { sameBinding } from '../client-model/commands'
import { commandId } from './command-id'
import { HttpError } from './http'

export function playerPreferencesApi(
  binding: components['schemas']['Binding'],
  csrf: string,
) {
  return async (
    preferences: PlayerPreferences | undefined,
    signal: AbortSignal,
  ): Promise<PlayerPreferences> => {
    const request_id = commandId(crypto)
    const response = await fetch(
      `/api/v1/universes/${binding.universe}/player-preferences`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        body: JSON.stringify({ context: { binding, request_id }, preferences }),
      },
    )
    if (!response.ok)
      throw new HttpError(response.status, 'Player preferences request failed')
    const data = validate<components['schemas']['PlayerPreferencesResponse']>(
      'PlayerPreferencesResponse',
      await response.json(),
    )
    if (!sameBinding(binding, data.binding) || data.request_id !== request_id)
      throw Error('Player preferences binding mismatch')
    return data.preferences
  }
}
