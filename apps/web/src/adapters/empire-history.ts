import type { components } from '../contracts'
import { validate } from '../client-model/schema'
import { commandId } from './command-id'
import { bindingKey, canonical } from '../client-model/commands'
import {
  timestampedCommandId,
  commandWindowError,
  definiteMutationResponse,
  futureSkewMs,
  futureCommand,
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
export class ProfileEditPending extends Error {
  constructor() {
    super(
      'An earlier profile change is still unconfirmed. Refresh to check it, then review and save your current edit.',
    )
  }
}

function sameField(a: ProfileAction, b: ProfileAction) {
  return (
    a.type === b.type &&
    (!('event' in a) || ('event' in b && a.event === b.event))
  )
}
function describeEdit(action: ProfileAction) {
  switch (action.type) {
    case 'Visibility':
      return action.public
        ? 'make the profile public'
        : 'make the profile private'
    case 'Publish':
      return `publish history entry ${action.event}`
    case 'Select':
      return `${action.selected ? 'select' : 'deselect'} history entry ${action.event}${action.featured ? ' as featured' : ''} with caption “${action.caption}”`
    case 'Identity':
      return `set the empire name to “${action.identity.name}”, tagline to “${action.identity.tagline}” and title to “${action.identity.title_id}”`
  }
}
export class ProfileEditReview extends Error {
  constructor(
    private readonly scope: string,
    private readonly row: ProfileCommand,
  ) {
    super(
      `The profile changed before this edit could be applied. Review the latest profile before saving again. Your edit was to ${describeEdit(row.action)}.`,
    )
  }
  dismiss() {
    pending.remove(
      'ProfileCommand',
      reviewScope(this.scope),
      this.row.command_id,
    )
  }
}
const reviewScope = (scope: string) => scope + ':review'
function refreshProfileClock(profile: EmpireProfile) {
  return readArchive<EmpireProfile>(
    'EmpireProfile',
    `/api/v4/empire-profiles/${profile.player}?library=false`,
    new AbortController().signal,
  )
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
    if (code !== 'COMMAND_IN_FUTURE')
      pending.remove('ProfileCommand', scope, envelope.command_id)
    else await refreshProfileClock(profile)
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
    if (futureCommand(error)) {
      await refreshProfileClock(profile)
      throw error
    }
    if (
      recovering &&
      error instanceof HttpError &&
      error.status === 409 &&
      error.code === 'Conflict'
    ) {
      // A concurrent accepted edit won this revision. Keep the submitted
      // values for human review, outside automatic submission recovery.
      pending.save('ProfileCommand', reviewScope(scope), envelope)
      pending.remove('ProfileCommand', scope, envelope.command_id)
      throw new ProfileEditReview(scope, envelope)
    }
    if (definiteMutationResponse(error, recovering))
      pending.remove('ProfileCommand', scope, envelope.command_id)
    throw error
  }
  pending.remove('ProfileCommand', scope, envelope.command_id)
  for (const old of pending.load<ProfileCommand>(
    'ProfileCommand',
    reviewScope(scope),
  )) {
    if (
      old.expected_revision < envelope.expected_revision &&
      sameField(old.action, envelope.action)
    )
      pending.remove('ProfileCommand', reviewScope(scope), old.command_id)
  }
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
  for (const row of rows) await submitProfile(profile, account, csrf, row, true)
  const [review] = pending.load<ProfileCommand>(
    'ProfileCommand',
    reviewScope(profileScope(profile, account)),
  )
  if (review)
    throw new ProfileEditReview(profileScope(profile, account), review)
  return rows.length > 0
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
    await refreshProfileClock(profile)
  }
  const scope = profileScope(profile, account)
  const rows = pending.load<ProfileCommand>('ProfileCommand', scope)
  // A repeat save after a transport failure still refers to the saved revision.
  const existing = rows.find(
    (row) =>
      row.expected_revision === profile.revision &&
      canonical(row.action) === canonical(action),
  )
  if (!existing && rows.length) throw new ProfileEditPending()
  const envelope = existing ?? {
    command_id: timestampedCommandId(commandId(crypto), serverNow()),
    expected_revision: profile.revision,
    action,
  }
  pending.save('ProfileCommand', scope, envelope)
  await submitProfile(profile, account, csrf, envelope, !!existing)
}
