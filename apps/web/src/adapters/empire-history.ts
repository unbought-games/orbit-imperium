import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { commandId } from './command-id'
import { bindingKey, canonical } from '../client-model/commands'
import {
  timestampedCommandId,
  commandWindowError,
  definiteMutationResponse,
  futureSkewMs,
} from '../client-model/command-window'
import { PendingCommands } from '../client-model/pending-commands'
import { request, HttpError } from './http'
export type EmpireProfile = components['schemas']['EmpireProfile']
export type OrbitProfile = components['schemas']['OrbitProfile']
export type HistoryEntry = components['schemas']['HistoryEntry']
export type HistoricalDetail = components['schemas']['HistoricalDetail']
export type ProfileAction = components['schemas']['ProfileAction']
type ProfileCommand = components['schemas']['ProfileCommand']
const pending = new PendingCommands(() => localStorage)
let serverClock: { at: number; received: number; local: number } | undefined
const serverNow = () =>
  serverClock
    ? serverClock.at + Math.max(0, performance.now() - serverClock.received)
    : Date.now()
const profileScope = (profile: EmpireProfile, account: string) =>
  bindingKey({
    account,
    player: profile.player,
    universe: profile.universe,
    epoch: profile.epoch,
  })
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
  const at = Date.parse(response.headers.get('Date') ?? '')
  serverClock = {
    at: Number.isFinite(at) ? at : Date.now(),
    received: performance.now(),
    local: Date.now(),
  }
  return validate<T>(schema, await response.json())
}
async function submitProfile(
  profile: EmpireProfile,
  account: string,
  csrf: string,
  envelope: ProfileCommand,
  recovering: boolean,
) {
  const scope = profileScope(profile, account)
  const code = commandWindowError(envelope.command_id, serverNow())
  if (code) {
    pending.remove('ProfileCommand', scope, envelope.command_id)
    throw new HttpError(409, code)
  }
  try {
    await request(
      `/api/v4/empire-profiles/${profile.player}`,
      'POST',
      envelope,
      csrf,
    )
  } catch (error) {
    if (definiteMutationResponse(error, recovering))
      pending.remove('ProfileCommand', scope, envelope.command_id)
    throw error
  }
  pending.remove('ProfileCommand', scope, envelope.command_id)
}

export async function recoverProfile(
  profile: EmpireProfile,
  account: string,
  csrf: string,
) {
  const rows = pending.load<ProfileCommand>(
    'ProfileCommand',
    profileScope(profile, account),
  )
  if (!rows.length) return false
  for (const row of rows) await submitProfile(profile, account, csrf, row, true)
  return true
}

export async function editProfile(
  profile: EmpireProfile,
  account: string,
  csrf: string,
  action: ProfileAction,
) {
  if (
    serverClock &&
    Math.abs(
      Date.now() -
        serverClock.local -
        (performance.now() - serverClock.received),
    ) > futureSkewMs
  ) {
    await readArchive<EmpireProfile>(
      'EmpireProfile',
      `/api/v4/empire-profiles/${profile.player}?library=false`,
      new AbortController().signal,
    )
  }
  const scope = profileScope(profile, account)
  const rows = pending.load<ProfileCommand>('ProfileCommand', scope)
  // A repeat save after a transport failure still refers to the saved revision.
  const existing = rows.find(
    (row) =>
      row.expected_revision === profile.revision &&
      canonical(row.action) === canonical(action),
  )
  const envelope = existing ?? {
    command_id: timestampedCommandId(commandId(crypto), serverNow()),
    expected_revision: profile.revision,
    action,
  }
  pending.save('ProfileCommand', scope, envelope)
  await submitProfile(profile, account, csrf, envelope, !!existing)
}
