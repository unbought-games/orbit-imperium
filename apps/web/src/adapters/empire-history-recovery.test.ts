import { afterEach, expect, it, vi } from 'vitest'
import {
  timestampedCommandId,
  commandTime,
} from '../client-model/command-window'
import { bindingKey } from '../client-model/commands'
import { PendingCommands } from '../client-model/pending-commands'
import { id, memoryStorage } from '../test-support/bootstrap'
import {
  editProfile,
  readArchive,
  recoverProfile,
  profileEditReview,
  ProfileEditNotSent,
  type EmpireProfile,
} from './empire-history'

const profile: EmpireProfile = {
  player: id(1),
  profile: id(2),
  universe: id(3),
  epoch: id(4),
  universe_name: 'Test',
  username: 'Pilot',
  display: null,
  owner: true,
  public: false,
  removed: false,
  closed: false,
  revision: 5,
  entries: [],
  next: null,
}

afterEach(() => vi.unstubAllGlobals())

it.each(['QuotaExceededError', 'SecurityError'])(
  'refuses a new profile edit before HTTP when retry storage throws %s',
  async (name) => {
    const storage = memoryStorage()
    storage.setItem = () => {
      throw new DOMException('private diagnostic', name)
    }
    vi.stubGlobal('localStorage', storage)
    const fetcher = vi.fn(async () =>
      Response.json(profile, { headers: { Date: new Date().toUTCString() } }),
    )
    vi.stubGlobal('fetch', fetcher)
    await readArchive('EmpireProfile', '/profile', new AbortController().signal)
    fetcher.mockClear()
    const error = await editProfile(profile, id(5), 'csrf', {
      type: 'Visibility',
      public: true,
    }).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(ProfileEditNotSent)
    expect((error as ProfileEditNotSent).details).toContain(
      `Condition: ${name}`,
    )
    expect((error as ProfileEditNotSent).details).not.toContain(
      'private diagnostic',
    )
    expect(fetcher).not.toHaveBeenCalled()
  },
)

it('rechecks an uncertain profile edit only for its original account and preserves it through a rotated CSRF token', async () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  const path = '/api/v4/empire-profiles/' + profile.player
  const epoch = 1_000_000
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(profile, {
        headers: { Date: new Date(epoch).toUTCString() },
      }),
    )
    .mockRejectedValueOnce(Error('lost acknowledgement'))
    .mockResolvedValueOnce(
      Response.json({ code: 'Forbidden' }, { status: 403 }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetcher)
  await readArchive('EmpireProfile', path, new AbortController().signal)
  await expect(
    editProfile(profile, id(5), 'old', { type: 'Visibility', public: true }),
  ).rejects.toThrow('lost acknowledgement')
  const original = fetcher.mock.calls[1][1].body
  expect(
    Math.abs(commandTime(JSON.parse(original).command_id)! - epoch),
  ).toBeLessThan(30_000)
  expect(await recoverProfile(profile, id(6), 'unrelated')).toBe(false)
  await expect(recoverProfile(profile, id(5), 'rotated')).rejects.toMatchObject(
    { status: 403 },
  )
  expect(storage.length).toBe(1)
  expect(await recoverProfile(profile, id(5), 'fresh')).toBe(true)
  expect(fetcher.mock.calls.slice(1).map(([, init]) => init.body)).toEqual([
    original,
    original,
    original,
  ])
  expect(storage.length).toBe(0)
})

it('keeps a future profile envelope, resamples its clock, and blocks a different unconfirmed edit', async () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  let serverTime = 100_000
  let sends = 0
  const posted: string[] = []
  const fetcher = vi.fn(async (_: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(String(init.body))
      if (++sends === 1) {
        serverTime = 40_000
        return Response.json({ code: 'COMMAND_IN_FUTURE' }, { status: 400 })
      }
      return new Response(null, { status: 204 })
    }
    return Response.json(profile, {
      headers: { Date: new Date(serverTime).toUTCString() },
    })
  })
  vi.stubGlobal('fetch', fetcher)
  await readArchive('EmpireProfile', '/profile', new AbortController().signal)
  const action = { type: 'Visibility' as const, public: true }
  await expect(
    editProfile(profile, id(5), 'csrf', action),
  ).rejects.toMatchObject({ code: 'COMMAND_IN_FUTURE' })
  expect(fetcher).toHaveBeenCalledTimes(3)
  await expect(
    editProfile(profile, id(5), 'csrf', { ...action, public: false }),
  ).rejects.toThrow('An earlier profile change is still unconfirmed')
  await expect(recoverProfile(profile, id(5), 'csrf')).rejects.toMatchObject({
    code: 'COMMAND_IN_FUTURE',
  })
  expect(posted).toHaveLength(1)
  expect(storage.length).toBe(1)
  serverTime = 71_000
  await readArchive('EmpireProfile', '/profile', new AbortController().signal)
  await recoverProfile(profile, id(5), 'csrf')
  expect(posted).toEqual([posted[0], posted[0]])
  expect(storage.length).toBe(0)
})

it('preserves a conflicting edit from two tabs for explicit review against the latest revision', async () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  const pending = new PendingCommands(() => storage)
  const scope = bindingKey({
    account: id(5),
    player: profile.player,
    universe: profile.universe,
    epoch: profile.epoch,
  })
  const intents = [true, false].map((value, index) => ({
    command_id: timestampedCommandId(id(index + 10), 100_000),
    expected_revision: profile.revision,
    action: { type: 'Visibility' as const, public: value },
  }))
  for (const row of intents) pending.save('ProfileCommand', scope, row)
  const posted: typeof intents = []
  const latest = { ...profile }
  vi.stubGlobal('fetch', async (_: string, init?: RequestInit) => {
    if (init?.method !== 'POST')
      return Response.json(latest, {
        headers: { Date: new Date(100_000).toUTCString() },
      })
    const body = JSON.parse(String(init.body))
    posted.push(body)
    if (body.expected_revision !== latest.revision)
      return Response.json({ code: 'Conflict' }, { status: 409 })
    latest.revision++
    return new Response(null, { status: 204 })
  })
  await readArchive('EmpireProfile', '/profile', new AbortController().signal)
  await expect(recoverProfile(profile, id(5), 'csrf')).rejects.toThrow(
    'make the profile private',
  )
  expect(posted).toEqual(intents)
  await expect(recoverProfile(latest, id(5), 'csrf')).rejects.toThrow(
    'Review the latest profile',
  )
  expect(posted).toEqual(intents)
  expect(storage.length).toBe(1)
  await editProfile(latest, id(5), 'csrf', intents[1].action)
  expect(posted[2].expected_revision).toBe(profile.revision + 1)
  expect(posted[2].command_id).not.toBe(intents[1].command_id)
  expect(storage.length).toBe(0)
})

it('drains independently stale revisions and keeps each draft available through a blocked or unrelated save', async () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  const pending = new PendingCommands(() => storage),
    account = id(5)
  const scope = bindingKey({
    account,
    player: profile.player,
    universe: profile.universe,
    epoch: profile.epoch,
  })
  const before = profile.revision - 1
  const intents = [true, false].map((value, index) => ({
    command_id: timestampedCommandId(id(index + 10), 100_000),
    expected_revision: before,
    action: { type: 'Visibility' as const, public: value },
  }))
  for (const envelope of intents)
    pending.save('ProfileCommand', scope, envelope)
  const posted: string[] = []
  vi.stubGlobal('fetch', async (_: string, init?: RequestInit) => {
    if (init?.method !== 'POST')
      return Response.json(profile, {
        headers: { Date: new Date(100_000).toUTCString() },
      })
    const row = JSON.parse(String(init.body))
    posted.push(row.command_id)
    return row.expected_revision === before
      ? Response.json({ code: 'Conflict' }, { status: 409 })
      : new Response(null, { status: 204 })
  })
  await readArchive('EmpireProfile', '/profile', new AbortController().signal)
  await expect(recoverProfile(profile, account, 'csrf')).rejects.toThrow(
    'make the profile public',
  )
  expect(posted).toEqual(intents.map((row) => row.command_id))
  expect(pending.load('ProfileCommand', scope)).toHaveLength(0)
  const blocker = {
    ...intents[0],
    command_id: timestampedCommandId(id(77), 100_000),
    expected_revision: profile.revision,
  }
  pending.save('ProfileCommand', scope, blocker)
  await expect(
    editProfile(profile, account, 'csrf', intents[1].action),
  ).rejects.toThrow('An earlier profile change is still unconfirmed')
  expect(profileEditReview(profile, account)?.message).toContain(
    'make the profile public',
  )
  // Finishing the public visibility edit satisfies just that draft.
  await editProfile(profile, account, 'csrf', intents[0].action)
  expect(profileEditReview(profile, account)?.message).toContain(
    'make the profile private',
  )
  expect(posted).toHaveLength(3)
  profileEditReview(profile, account)!.dismiss()
  expect(profileEditReview(profile, account)).toBeNull()
  expect(storage.length).toBe(0)
})
