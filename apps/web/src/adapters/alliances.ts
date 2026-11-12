import { commandId } from './command-id'
import type { components } from '../contracts'
import type { Binding } from '../client-model/commands'
import { validate } from '../client-model/schema'
import { request } from './http'
type S = components['schemas']
export async function allianceQuery(
  binding: Binding,
  csrf: string,
  query: S['AllianceQuery'],
  request_id: string = commandId(crypto),
): Promise<S['AllianceView']> {
  const result = validate<S['AllianceView']>(
    'AllianceView',
    await request(
      `/api/v4/universes/${binding.universe}/alliances/query`,
      'POST',
      { context: { binding, request_id }, query },
      csrf,
      10000,
      { 'X-Orbit-Alliance-Presentation': '1', 'X-Orbit-Insignia': '5' },
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
  const authored =
    command.action.type === 'SavePresentation'
      ? {
          ...command,
          action: {
            ...command.action,
            edits: command.action.edits.map((edit) =>
              edit.type === 'SetIdentity' &&
              edit.value.crest.kind === 'composition'
                ? {
                    ...edit,
                    value: {
                      ...edit.value,
                      crest: {
                        kind: 'composition' as const,
                        recipe: edit.value.crest.recipe,
                      },
                    },
                  }
                : edit,
            ),
          },
        }
      : command
  const result = validate<S['AllianceCommandResult']>(
    'AllianceCommandResult',
    await request(
      `/api/v4/universes/${binding.universe}/alliances/commands`,
      'POST',
      { context: { binding, request_id: commandId(crypto) }, ...authored },
      csrf,
      10000,
      { 'X-Orbit-Alliance-Presentation': '1', 'X-Orbit-Insignia': '5' },
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
      headers: {
        'X-Orbit-Alliance-Presentation': '1',
        'X-Orbit-Insignia': '5',
      },
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

export async function readAllianceInvitation(
  universe: string,
  invitation: string,
  signal: AbortSignal,
): Promise<S['PublicAlliance']> {
  return readRecruitment(
    'PublicAlliance',
    `/api/v4/universes/${encodeURIComponent(universe)}/invitations/${encodeURIComponent(invitation)}`,
    signal,
  )
}
/** Recruitment links must never display one alliance while acting on another. */
export async function readRecruitmentAlliance(
  universe: string,
  alliance: string | undefined,
  invitation: string | undefined,
  signal: AbortSignal,
): Promise<S['PublicAlliance']> {
  let data: S['PublicAlliance']
  if (invitation)
    data = await readAllianceInvitation(universe, invitation, signal)
  else {
    if (!alliance) throw new Error('Alliance unavailable.')
    data = await readPublicAlliance(universe, alliance, signal)
  }
  if (
    (alliance && data.summary.id !== alliance) ||
    data.summary.universe !== universe
  )
    throw new Error(
      'This invitation does not match the requested alliance. Ask for a new link.',
    )
  return data
}
export async function readRecruitmentDirectory(
  universe: string,
  search: URLSearchParams,
  signal: AbortSignal,
): Promise<S['RecruitmentDirectory']> {
  return readRecruitment(
    'RecruitmentDirectory',
    `/api/v4/universes/${encodeURIComponent(universe)}/recruitment?${search}`,
    signal,
  )
}
async function readRecruitment<T>(
  schema: string,
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    credentials: 'omit',
    headers: { 'X-Orbit-Alliance-Presentation': '1', 'X-Orbit-Insignia': '5' },
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'This invitation or universe is no longer available. Ask for a new link or browse recruiting alliances.'
        : 'Unable to load recruitment. Please try again.',
    )
  return validate<T>(schema, await response.json())
}
