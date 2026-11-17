import type { components } from '../contracts'
import type {
  ShipAppearanceAction,
  ShipAppearanceState,
} from '../client-model/ship-appearance-types'
import { validate } from '../client-model/schema'
import { HttpError } from './http'

export function shipAppearancesApi(
  binding: components['schemas']['Binding'],
  csrf: string,
) {
  return async (
    action: ShipAppearanceAction,
    signal: AbortSignal,
    request_id: string,
  ): Promise<ShipAppearanceState> => {
    const response = await fetch(
      `/api/v1/universes/${binding.universe}/ship-appearances`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        body: JSON.stringify({ context: { binding, request_id }, action }),
      },
    )
    if (!response.ok)
      throw new HttpError(response.status, 'Ship appearance request failed')
    const state = validate<ShipAppearanceState>(
      'ShipAppearanceState',
      await response.json(),
    )
    if (
      state.request_id !== request_id ||
      Object.keys(binding).some(
        (key) =>
          binding[key as keyof typeof binding] !==
          state.binding[key as keyof typeof binding],
      )
    )
      throw Error('Ship appearance binding mismatch')
    return state
  }
}
