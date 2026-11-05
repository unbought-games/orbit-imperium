import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { request } from './http'
export type EmpireProfile = components['schemas']['EmpireProfile']
export type OrbitProfile = components['schemas']['OrbitProfile']
export type HistoryEntry = components['schemas']['HistoryEntry']
export type HistoricalDetail = components['schemas']['HistoricalDetail']
export type ProfileAction = components['schemas']['ProfileAction']
export class ArchiveReadError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function readArchive<T>(
  schema: string,
  path: string,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    cache: 'no-store',
    headers: { 'x-orbit-identity': '1' },
    credentials: 'same-origin',
  })
  if (!response.ok)
    throw new ArchiveReadError(
      response.status,
      response.status === 404
        ? 'This profile or record is not available to you.'
        : response.status === 401
          ? 'Sign in to open your profile.'
          : 'History could not be loaded. Please retry.',
    )
  return validate<T>(schema, await response.json())
}
export async function editProfile(
  profile: EmpireProfile,
  csrf: string,
  action: ProfileAction,
  command: string,
) {
  await request(
    `/api/v4/empire-profiles/${profile.player}`,
    'POST',
    { command_id: command, expected_revision: profile.revision, action },
    csrf,
  )
}
