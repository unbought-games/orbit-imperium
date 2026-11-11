import type { components } from '../contracts'
import type { Binding } from '../client-model/commands'
import { validate } from '../client-model/schema'
import { request, HttpError } from './http'
import { commandId } from './command-id'
type S = components['schemas']
export async function presentationCatalog(
  signal?: AbortSignal,
  alliance?: string,
): Promise<S['AlliancePresentationCatalog']> {
  const response = await fetch(
    `/api/alliance-presentation/catalog${alliance ? `?alliance=${encodeURIComponent(alliance)}` : ''}`,
    {
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    },
  )
  if (!response.ok)
    throw new Error('Alliance customization is unavailable. Please try again.')
  return validate('AlliancePresentationCatalog', await response.json())
}
export async function allianceMedia(
  binding: Binding,
  csrf: string,
  alliance: string,
  action: S['AllianceMediaAction'],
): Promise<S['AllianceMediaLibrary']> {
  return validate(
    'AllianceMediaLibrary',
    await request(
      `/api/v4/universes/${binding.universe}/alliances/media`,
      'POST',
      { context: { binding, request_id: commandId(crypto) }, alliance, action },
      csrf,
    ),
  )
}
export async function uploadAllianceMedia(
  binding: Binding,
  csrf: string,
  alliance: string,
  file: File,
  id: string,
): Promise<S['AllianceMedia']> {
  await allianceMedia(binding, csrf, alliance, {
    type: 'Begin',
    media_id: id,
    filename: file.name,
    bytes: file.size,
  })
  const response = await fetch(
    `/api/v4/universes/${binding.universe}/alliances/${alliance}/media/${id}/content?epoch=${binding.epoch}`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-CSRF-Token': csrf,
      },
      body: file,
      signal: AbortSignal.timeout(120000),
    },
  )
  if (!response.ok) {
    const problem = await response.json().catch(() => null)
    throw new HttpError(
      response.status,
      problem?.message ??
        'Upload could not finish. You can retry the same file.',
    )
  }
  const result = validate<S['AllianceMediaLibrary']>(
    'AllianceMediaLibrary',
    await response.json(),
  )
  const media = result.media.find((m) => m.id === id && m.state === 'ready')
  if (!media) throw new Error('The upload did not return a ready image.')
  return media
}
