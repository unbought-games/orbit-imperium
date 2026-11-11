import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { commandId } from './command-id'
import { request } from './http'

type Binding = components['schemas']['Binding']
export type ArrivalAction = components['schemas']['ArrivalAction']
export type ArrivalState = components['schemas']['ArrivalState']

export async function sendArrival(
  binding: Binding,
  csrf: string,
  action: ArrivalAction,
): Promise<ArrivalState> {
  return validate<ArrivalState>(
    'ArrivalState',
    await request(
      `/api/v1/universes/${binding.universe}/arrival`,
      'POST',
      { context: { binding, request_id: commandId(crypto) }, action },
      csrf,
      10000,
      { 'X-Orbit-Arrival': '1' },
    ),
  )
}
