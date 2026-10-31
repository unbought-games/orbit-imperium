import { commandId } from './command-id'
import type { components } from '../contracts'
import { validate } from '../client-model/schema'
export type ProfileSource = components['schemas']['ProfileSource']
export type PlayerDisplay = components['schemas']['PlayerDisplay']
export type PlayerProfiles = components['schemas']['PlayerProfiles']
export type Binding = components['schemas']['Binding']

export function playerProfilesApi(binding: Binding, csrf: string) {
  return async (
    source: ProfileSource,
    signal: AbortSignal,
  ): Promise<PlayerProfiles> => {
    const request_id = commandId(crypto)
    const response = await fetch(
      `/api/v1/universes/${binding.universe}/player-profiles`,
      {
        method: 'POST',
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'x-orbit-insignia': '1',
        },
        body: JSON.stringify({ context: { binding, request_id }, source }),
      },
    )
    if (!response.ok) throw new Error('Player profiles unavailable')
    const result = validate<PlayerProfiles>(
      'PlayerProfiles',
      await response.json(),
    )
    if (
      result.request_id !== request_id ||
      Object.keys(binding).some(
        (key) =>
          binding[key as keyof Binding] !==
          result.binding[key as keyof Binding],
      )
    )
      throw new Error('Player profile binding mismatch')
    if (
      new Set(result.players.map((p) => p.player)).size !==
      result.players.length
    )
      throw new Error('Duplicate player profile')
    return result
  }
}
