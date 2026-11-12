import { expect, it } from 'vitest'
import { InvitationDelivery } from './invitation-delivery'
import {
  rememberInvitation,
  rememberedInvitation,
} from './community-invitation'
import { memoryStorage } from '../test-support/bootstrap'
import { HttpError } from '../adapters/http'

it('retains one operation across a transient outage and a new document without blocking entry', async () => {
  const storage = memoryStorage()
  let now = 1000
  rememberInvitation(storage, 'inv_one', now)
  const requests: { code: string; request_id: string }[] = []
  const failed = new InvitationDelivery(
    storage,
    async (request) => {
      requests.push(request)
      throw new HttpError(503, 'Unavailable')
    },
    () => 'stable-operation',
    () => now,
  )
  await expect(
    failed.attempt('account-one', new AbortController().signal),
  ).resolves.toBeUndefined()
  expect(rememberedInvitation(storage, now)).toBe('inv_one')
  const resumed = new InvitationDelivery(
    storage,
    async (request) => {
      requests.push(request)
    },
    () => {
      throw Error('must reuse identity')
    },
    () => now,
  )
  await resumed.attempt('account-one', new AbortController().signal)
  expect(requests).toHaveLength(1)
  now += 30_000
  await resumed.attempt('account-two', new AbortController().signal)
  expect(requests).toHaveLength(1)
  await resumed.attempt('account-one', new AbortController().signal)
  expect(requests).toEqual([
    { code: 'inv_one', request_id: 'stable-operation' },
    { code: 'inv_one', request_id: 'stable-operation' },
  ])
  expect(rememberedInvitation(storage, now)).toBe('')
})
it('clears invalid/self/already-attributed responses while retaining refreshable authentication and transient failures', async () => {
  for (const status of [400, 401, 403, 404, 409, 408, 429, 503]) {
    const storage = memoryStorage()
    rememberInvitation(storage, 'inv_one', 1000)
    const delivery = new InvitationDelivery(
      storage,
      async () => {
        throw new HttpError(status, 'fixture')
      },
      () => 'operation',
      () => 1000,
    )
    await expect(
      delivery.attempt('account', new AbortController().signal),
    ).resolves.toBeUndefined()
    expect(rememberedInvitation(storage, 1000)).toBe(
      [401, 408, 429, 503].includes(status) ? 'inv_one' : '',
    )
  }
})
it('coalesces overlapping delivery and never applies an expired invitation', async () => {
  const storage = memoryStorage()
  rememberInvitation(storage, 'inv_one', 1000)
  let finish!: () => void
  let calls = 0
  const delivery = new InvitationDelivery(
    storage,
    () => {
      calls++
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    },
    () => 'operation',
    () => 1000,
  )
  const first = delivery.attempt('account', new AbortController().signal)
  await delivery.attempt('account', new AbortController().signal)
  expect(calls).toBe(1)
  finish()
  await first
  rememberInvitation(storage, 'inv_expired', 1000)
  const expired = new InvitationDelivery(
    storage,
    async () => {
      throw Error('must not dispatch')
    },
    () => 'operation',
    () => 1000 + 30 * 86400000,
  )
  await expect(
    expired.attempt('account', new AbortController().signal),
  ).resolves.toBeUndefined()
})

it('a rejected identity waits for a fresh authenticated coordinator instead of polling', async () => {
  const storage = memoryStorage()
  let now = 1000,
    calls = 0
  rememberInvitation(storage, 'inv_one', now)
  const delivery = new InvitationDelivery(
    storage,
    async () => {
      calls++
      throw new HttpError(401, 'Unauthenticated')
    },
    () => 'operation',
    () => now,
  )
  await delivery.attempt('account', new AbortController().signal)
  now += 60_000
  await delivery.attempt('account', new AbortController().signal)
  expect(calls).toBe(1)
  expect(rememberedInvitation(storage, now)).toBe('inv_one')
})
