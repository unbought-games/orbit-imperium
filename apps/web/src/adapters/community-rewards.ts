import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { HttpError } from './http'

export type CommunityOwner = components['schemas']['CommunityOwner']
export type CommunityStatus = components['schemas']['CommunityStatus']
export type CommunityActionRequest =
  components['schemas']['CommunityActionRequest']
export type CommunityAction = CommunityActionRequest['action']
export type CommunityActionResponse =
  components['schemas']['CommunityActionResponse']
export type CommunityInvitationPreview =
  components['schemas']['CommunityInvitationPreview']
export type CosmeticMark = components['schemas']['CosmeticMark']
export type CommunityMarks = components['schemas']['CommunityMarks']
export type CommunityAllianceHonors =
  components['schemas']['CommunityAllianceHonors']
export type CosmeticDye = components['schemas']['CosmeticDye']
export type CosmeticTreatment = components['schemas']['CosmeticTreatment']

/** Account identity is deliberately absent; the authenticated server session owns it. */
export function communityRewardsApi(csrf: string, send: typeof fetch = fetch) {
  async function call<T>(
    path: string,
    schema: string,
    signal: AbortSignal,
    body?: CommunityActionRequest,
  ): Promise<T> {
    const response = await send(path, {
      method: body ? 'POST' : 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      headers: {
        'content-type': 'application/json',
        ...(body ? { 'x-csrf-token': csrf } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok)
      throw new HttpError(
        response.status,
        response.status === 409 ? 'RewardsChanged' : 'RewardsUnavailable',
      )
    return validate<T>(schema, await response.json())
  }
  return {
    owner: (signal: AbortSignal) =>
      call<CommunityStatus>('/api/v1/rewards', 'CommunityStatus', signal),
    marks: (signal: AbortSignal) =>
      call<CommunityMarks>('/api/v1/rewards/marks', 'CommunityMarks', signal),
    allianceHonors: (alliance: string, signal: AbortSignal) =>
      call<CommunityAllianceHonors>(
        `/api/v1/rewards/alliances/${encodeURIComponent(alliance)}/honors`,
        'CommunityAllianceHonors',
        signal,
      ),
    invitationPreview: (code: string, signal: AbortSignal) =>
      call<CommunityInvitationPreview>(
        `/api/v1/rewards/invitation-preview?code=${encodeURIComponent(code)}`,
        'CommunityInvitationPreview',
        signal,
      ),
    // Keep the same request ID for a retry; a new selection gets a new ID.
    act: (request: CommunityActionRequest, signal: AbortSignal) =>
      call<CommunityActionResponse>(
        '/api/v1/rewards/actions',
        'CommunityActionResponse',
        signal,
        request,
      ),
  }
}
