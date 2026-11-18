import { afterEach, expect, it, vi } from 'vitest'
import { commandTime } from '../client-model/command-window'
import { id, memoryStorage } from '../test-support/bootstrap'
import {
  editProfile,
  readArchive,
  recoverProfile,
  type EmpireProfile,
} from './empire-history'

afterEach(() => vi.unstubAllGlobals())

it('rechecks an uncertain profile edit only for its original account and preserves it through a rotated CSRF token', async () => {
  const storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
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
