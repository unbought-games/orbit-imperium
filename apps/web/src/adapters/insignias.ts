import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { commandId } from './command-id'
import { HttpError } from './http'
export type InsigniaState = components['schemas']['InsigniaState']
export type InsigniaAction = components['schemas']['InsigniaAction']
export type InsigniaDesign = components['schemas']['InsigniaDesign']
export type InsigniaRecipe = components['schemas']['InsigniaRecipe']
export type InsigniaAppearance = components['schemas']['InsigniaAppearance']
export function insigniasApi(
  binding: components['schemas']['Binding'],
  csrf: string,
) {
  return async (
    action: InsigniaAction,
    signal: AbortSignal,
  ): Promise<InsigniaState> => {
    const request_id = commandId(crypto)
    const response = await fetch(
      `/api/v1/universes/${binding.universe}/insignias`,
      {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf,
          'x-orbit-catalog': '1',
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
        body: JSON.stringify({ context: { binding, request_id }, action }),
      },
    )
    if (!response.ok)
      throw new HttpError(response.status, 'Insignia request failed')
    const state = validate<InsigniaState>(
      'InsigniaState',
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
      throw Error('Insignia binding mismatch')
    return state
  }
}
