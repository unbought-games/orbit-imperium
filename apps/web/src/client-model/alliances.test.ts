import { expect, it, vi } from 'vitest'
import {
  AlliancesController,
  canDelegate,
  permissionDependencies,
  type AllianceDetail,
} from './alliances'
import type { components } from '../contracts'
const view = {
  binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
  request_id: 'r',
  sampled_at: 0,
  directory: [],
  directory_count: 0,
  alliance: null,
  applications: [],
} satisfies components['schemas']['AllianceView']
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
it('suppresses stale reads and clears private data on disposal or denied access', async () => {
  const first = deferred<typeof view>(),
    second = deferred<typeof view>()
  const read = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockResolvedValue(view)
  const controller = new AlliancesController({
    read,
    command: vi.fn(),
    newId: () => 'id',
  })
  const old = controller.refresh(),
    fresh = controller.refresh({ type: 'Directory', search: 'new', offset: 0 })
  second.resolve({ ...view, directory_count: 2 })
  await fresh
  first.resolve({ ...view, directory_count: 1 })
  await old
  expect(controller.store.getState().directory?.directory_count).toBe(2)
  read.mockRejectedValue({ status: 403 })
  await controller.refresh()
  expect(controller.store.getState().view).toBeNull()
  read.mockResolvedValue(view)
  await controller.refresh()
  controller.clear()
  expect(controller.store.getState().view).toBeNull()
})
it('retries uncertain commands with immutable identity and blocks double submissions', async () => {
  const outcome = deferred<null>()
  const command = vi
    .fn()
    .mockReturnValueOnce(outcome.promise)
    .mockResolvedValue({ command_id: 'one', alliance: 'x', revision: 1 })
  const read = vi.fn().mockResolvedValue(view)
  const controller = new AlliancesController({
    read,
    command,
    newId: () => 'one',
  })
  const action = { type: 'Create' as const, name: 'Original', tag: 'TAG' }
  const submitting = controller.run(action)
  action.name = 'Edited'
  expect(await controller.run(action)).toBe(false)
  outcome.resolve(null)
  expect(await submitting).toBe(false)
  expect(controller.store.getState().pending?.action).toMatchObject({
    name: 'Original',
  })
  expect(await controller.run(action)).toBe(false)
  expect(await controller.retry()).toBe(true)
  expect(command.mock.calls[1][0]).toEqual(command.mock.calls[0][0])
  expect(read).toHaveBeenCalledWith({ type: 'Mine' })
  expect(controller.store.getState().pending).toBeNull()
})
it('definitive conflicts permit corrected drafts; disposed commands cannot restore private data', async () => {
  const command = vi.fn().mockRejectedValue({ status: 409 })
  const controller = new AlliancesController({
    read: vi.fn().mockResolvedValue(view),
    command,
    newId: () => 'one',
  })
  expect(await controller.run({ type: 'Leave', alliance: 'a' })).toBe(false)
  expect(controller.store.getState().pending).toBeNull()
  const pending = deferred<null>()
  command.mockReturnValue(pending.promise)
  const run = controller.run({ type: 'Join', alliance: 'a' })
  controller.clear()
  pending.resolve(null)
  await run
  expect(controller.store.getState()).toMatchObject({
    view: null,
    busy: false,
    error: '',
    pending: null,
  })
})
it('derives delegation from grantable rights and enforces dependent permissions', () => {
  const detail = { grantable_permissions: ['ViewMembers'] } as AllianceDetail
  expect(canDelegate(detail, ['ViewMembers'])).toBe(true)
  expect(canDelegate(detail, ['ViewActivity'])).toBe(false)
  expect(permissionDependencies(['ViewActivity'])).toBe(false)
  expect(permissionDependencies(['ProcessApplications'])).toBe(false)
  expect(
    permissionDependencies([
      'ViewActivity',
      'ViewMembers',
      'ProcessApplications',
      'ViewApplications',
    ]),
  ).toBe(true)
})

it('drops private drafts when a fresh response revokes authority', async () => {
  const alliance = {
    summary: { id: 'alliance' },
    permissions: ['ViewMembers', 'ManageRoles'],
    grantable_permissions: ['ViewMembers'],
  } as AllianceDetail
  const read = vi.fn().mockResolvedValue({ ...view, alliance })
  const onAccessLost = vi.fn()
  const controller = new AlliancesController({
    read,
    command: vi.fn(),
    newId: () => 'id',
    onAccessLost,
  })
  await controller.refresh()
  expect(onAccessLost).not.toHaveBeenCalled()
  read.mockResolvedValue({
    ...view,
    alliance: {
      ...alliance,
      permissions: ['ViewMembers'],
      grantable_permissions: [],
    },
  })
  await controller.refresh()
  expect(onAccessLost).toHaveBeenCalledOnce()
  expect(controller.store.getState().view?.alliance?.permissions).toEqual([
    'ViewMembers',
  ])
})

function memberView(): components['schemas']['AllianceView'] {
  return {
    ...view,
    alliance: {
      summary: {
        id: 'alliance',
        universe: 'u',
        tag: 'TAG',
        name: 'Alliance',
        member_count: 1,
        recruitment: 'Open',
      },
      revision: 1,
      leader: 'leader',
      public_text: '',
      permissions: ['ViewMembers', 'ManageRoles', 'AssignRoles'],
      grantable_permissions: ['ViewMembers'],
    },
  }
}
it('recovers an expired board cursor and manual refresh starts at the newest page', async () => {
  const current = memberView()
  const read = vi.fn().mockResolvedValue(current)
  const controller = new AlliancesController({
    read,
    command: vi.fn(),
    newId: () => 'id',
  })
  await controller.refresh()
  read.mockRejectedValueOnce({ status: 409 }).mockResolvedValue(current)
  await controller.refresh({
    type: 'Detail',
    alliance: 'alliance',
    post_before: 'expired',
  })
  expect(read).toHaveBeenLastCalledWith({
    type: 'Detail',
    alliance: 'alliance',
    post_before: null,
  })
  expect(controller.store.getState().view?.alliance).toEqual(current.alliance)
  expect(controller.store.getState().error).toBe('')
  await controller.refresh({
    type: 'Detail',
    alliance: 'alliance',
    post_before: 'valid-page',
  })
  await controller.refresh()
  expect(read).toHaveBeenLastCalledWith({
    type: 'Detail',
    alliance: 'alliance',
    post_before: null,
  })
})
it('role mutations retain unrelated drafts unless the refreshed authority is reduced', async () => {
  const current = memberView()
  const read = vi.fn().mockResolvedValue(current),
    onAccessLost = vi.fn()
  const controller = new AlliancesController({
    read,
    command: vi.fn().mockResolvedValue({
      command_id: 'id',
      alliance: 'alliance',
      revision: 2,
    }),
    newId: () => 'id',
    onAccessLost,
  })
  await controller.refresh()
  for (const action of [
    {
      type: 'SaveRole' as const,
      alliance: 'alliance',
      role: null,
      name: 'Recruiter',
      permissions: [],
      grantable_permissions: [],
    },
    {
      type: 'AssignRoles' as const,
      alliance: 'alliance',
      player: 'another',
      roles: [],
    },
    { type: 'DeleteRole' as const, alliance: 'alliance', role: 'role' },
  ])
    expect(await controller.run(action)).toBe(true)
  expect(onAccessLost).not.toHaveBeenCalled()
  read.mockResolvedValue({
    ...current,
    alliance: {
      ...current.alliance!,
      permissions: ['ViewMembers'],
      grantable_permissions: [],
    },
  })
  expect(
    await controller.run({
      type: 'AssignRoles',
      alliance: 'alliance',
      player: 'p',
      roles: [],
    }),
  ).toBe(true)
  expect(onAccessLost).toHaveBeenCalledOnce()
})
it.each([false, true])(
  'command NotFound rechecks membership before clearing drafts (revoked=%s)',
  async (revoked) => {
    const current = memberView()
    const read = vi.fn().mockResolvedValue(current),
      onAccessLost = vi.fn()
    const controller = new AlliancesController({
      read,
      command: vi.fn().mockRejectedValue(
        Object.assign(new Error('Target no longer available'), {
          status: 404,
        }),
      ),
      newId: () => 'id',
      onAccessLost,
    })
    await controller.refresh()
    read.mockResolvedValue(revoked ? view : current)
    expect(
      await controller.run({
        type: 'Reject',
        alliance: 'alliance',
        application: 'gone',
      }),
    ).toBe(false)
    expect(read).toHaveBeenCalledTimes(revoked ? 3 : 2)
    expect(controller.store.getState().view?.alliance).toEqual(
      revoked ? null : current.alliance,
    )
    expect(controller.store.getState().error).toContain(
      'Target no longer available',
    )
    expect(onAccessLost).toHaveBeenCalledTimes(revoked ? 1 : 0)
    expect(controller.store.getState().pending).toBeNull()
  },
)
