import type { components } from '../contracts'
import type { Binding } from '../client-model/commands'
import { validate } from '../client-model/schema'
import { request } from './http'
type S = components['schemas']
export async function allianceQuery(
  binding: Binding,
  csrf: string,
  query: S['AllianceQuery'],
  request_id: string = crypto.randomUUID(),
): Promise<S['AllianceView']> {
  const result = validate<S['AllianceView']>(
    'AllianceView',
    await request(
      `/api/v4/universes/${binding.universe}/alliances/query`,
      'POST',
      { context: { binding, request_id }, query },
      csrf,
    ),
  )
  if (
    result.request_id !== request_id ||
    Object.keys(binding).some(
      (key) =>
        binding[key as keyof Binding] !== result.binding[key as keyof Binding],
    )
  )
    throw new Error('Alliance response binding mismatch')
  return result
}
export async function allianceCommand(
  binding: Binding,
  csrf: string,
  command: Omit<S['AllianceCommandRequest'], 'context'>,
): Promise<S['AllianceCommandResult']> {
  const result = validate<S['AllianceCommandResult']>(
    'AllianceCommandResult',
    await request(
      `/api/v4/universes/${binding.universe}/alliances/commands`,
      'POST',
      { context: { binding, request_id: crypto.randomUUID() }, ...command },
      csrf,
    ),
  )
  if (result.command_id !== command.command_id)
    throw new Error('Alliance command identity mismatch')
  return result
}
export async function readPublicAlliance(
  universe: string,
  alliance: string,
  signal: AbortSignal,
): Promise<S['PublicAlliance']> {
  const response = await fetch(
    `/api/v4/universes/${encodeURIComponent(universe)}/alliances/${encodeURIComponent(alliance)}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    },
  )
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'This alliance is no longer available.'
        : 'Alliance unavailable. Please try again.',
    )
  return validate<S['PublicAlliance']>('PublicAlliance', await response.json())
}
