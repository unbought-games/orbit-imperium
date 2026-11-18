import { expect, it, vi } from 'vitest'
import { Coordinator } from './coordinator'
import {
  commandTime,
  presenceCommandId,
  timestampedCommandId,
  withinCommandWindow,
} from './command-window'
import { PendingCommands } from './pending-commands'
import type { GamePort, Envelope, BoundReceipt } from './commands'
import { readyFixture, memoryStorage, id } from '../test-support/bootstrap'

it('encodes the authoritative milliseconds and changes one entropy bit for presence', () => {
  const command = timestampedCommandId(
    'ffffffff-ffff-4123-8123-123456789abc',
    1_000_000,
  )
  expect(command).toBe('0000000f-4240-7123-8123-123456789abc')
  expect(presenceCommandId(command)).toBe(
    '0000000f-4240-7123-8123-123456789abd',
  )
  expect(commandTime(command)).toBe(1_000_000)
  expect(commandTime(id(1))).toBeNull()
  expect(withinCommandWindow(command, 969_999)).toBe(false)
  expect(withinCommandWindow(command, 970_000)).toBe(true)
  expect(withinCommandWindow(command, 1_899_999)).toBe(true)
  expect(withinCommandWindow(command, 1_900_000)).toBe(false)
})

function recovery() {
  const { session, snapshot } = readyFixture(4)
  const storage = memoryStorage()
  let seq = 42,
    online = true,
    visible = true
  let mono = 50_000
  const platform = {
    newId: () => id(seq++),
    monotonicNowMs: () => mono,
    pendingCommands: new PendingCommands(() => storage),
    isOnline: () => online,
    isVisible: () => visible,
  }
  let at = snapshot.candidate.sampled_at
  snapshot.view.sampled_at = 999_999_999
  const send = vi
    .fn<GamePort['submit']>()
    .mockRejectedValue(Error('lost acknowledgement'))
  const read = vi
    .fn<GamePort['receipt']>()
    .mockRejectedValue({ status: 404, code: 'NotFound' })
  const view = vi.fn<GamePort['view']>(async (ctx) => ({
    ...snapshot.view,
    request_id: ctx.request_id,
  }))
  const port = {
    currentBinding: vi.fn<GamePort['currentBinding']>(
      async (_, request_id) => ({
        ...snapshot.candidate,
        request_id,
        sampled_at: at,
      }),
    ),
    view,
    submit: send,
    receipt: read,
    settings: async () => snapshot.settings,
    quote: async () => {
      throw Error('unused')
    },
  }
  return {
    session,
    snapshot,
    storage,
    platform,
    port,
    send,
    read,
    view,
    model: () => new Coordinator(port, platform),
    advance: (ms: number) => {
      mono += ms
    },
    setTime: (ms: number) => {
      at = ms
    },
    suspend: () => {
      visible = false
      online = false
    },
    wake: () => {
      visible = true
      online = true
    },
  }
}

const order = () => ({
  type: 'World' as const,
  action: { type: 'RenamePlanet' as const, body: id(42), name: 'Titan' },
})

it('restarts offline, then replays the exact paired envelope once with a confirmed binding', async () => {
  const f = recovery()
  const first = f.model()
  await first.initialize(f.session, f.snapshot)
  const input = order()
  const command = await first.send(input)
  expect(commandTime(command!)).toBe(1000)
  const original = structuredClone(f.send.mock.calls[0][0])
  input.action.name = 'Different intent'
  first.invalidate()
  f.suspend()
  const restored = f.model()
  await restored.initialize(f.session, f.snapshot)
  await restored.reconcilePending()
  expect(f.read).not.toHaveBeenCalled()
  f.wake()
  f.send.mockImplementationOnce(async (envelope) => ({
    protocol: 4,
    binding: envelope.binding,
    command_id: envelope.command_id,
    status: 'Committed',
    admitted_at: 1200,
    executed_at: 1300,
    minimum_viewer_revision: '0',
    result_ids: [],
  }))
  await Promise.all([restored.reconcilePending(), restored.reconcilePending()])
  expect(f.send.mock.calls.map(([envelope]) => envelope)).toEqual([
    original,
    original,
  ])
  expect(f.port.currentBinding).toHaveBeenCalledOnce()
  expect(f.storage.length).toBe(0)
})

it.each([404, 410])(
  'retires an overnight unknown attempt after lookup %s and refreshes the view',
  async (status) => {
    const f = recovery()
    const first = f.model()
    await first.initialize(f.session, f.snapshot)
    await first.send(order())
    first.invalidate()
    f.setTime(901000)
    if (status === 410)
      f.read.mockRejectedValue({ status, code: 'COMMAND_HISTORY_EXPIRED' })
    const restored = f.model()
    await restored.initialize(f.session, f.snapshot)
    await restored.reconcilePending()
    expect(f.send).toHaveBeenCalledTimes(1)
    expect(restored.message).toContain('earlier action may have completed')
    expect(f.view).toHaveBeenCalled()
    expect(f.storage.length).toBe(0)
    await restored.reconcilePending()
    expect(f.read).toHaveBeenCalledTimes(1)
  },
)

it('keeps an accepted order readable after its deadline without submitting another POST', async () => {
  const f = recovery()
  const first = f.model()
  await first.initialize(f.session, f.snapshot)
  const command_id = (await first.send(order()))!
  const receipt: BoundReceipt = {
    protocol: 4,
    binding: f.snapshot.candidate.binding,
    command_id,
    status: 'Pending',
    admitted_at: 1000,
    executed_at: null,
  }
  f.read.mockResolvedValue(receipt)
  f.setTime(90_000_000)
  const restored = f.model()
  await restored.initialize(f.session, f.snapshot)
  await restored.reconcilePending()
  expect([...restored.ledger.values()][0].receipt).toEqual(receipt)
  expect(f.storage.length).toBe(1)
  expect(f.send).toHaveBeenCalledTimes(1)
})

it('isolates accounts and epochs in shared storage and ignores a mismatched envelope', async () => {
  const f = recovery()
  const first = f.model()
  await first.initialize(f.session, f.snapshot)
  await first.send(order())
  const key = Object.keys(f.storage).find((key) =>
    key.startsWith('orbit:command-window'),
  )!
  const saved: Envelope = JSON.parse(f.storage.getItem(key)!)
  saved.binding = { ...saved.binding, epoch: id(90) }
  f.storage.setItem(key, JSON.stringify(saved))
  const restored = f.model()
  await restored.initialize(f.session, f.snapshot)
  await restored.reconcilePending()
  expect(restored.ledger.size).toBe(0)
  expect(f.read).not.toHaveBeenCalled()
  expect(f.send).toHaveBeenCalledTimes(1)
})

it('samples database time again when a sleeping device paused its monotonic clock', async () => {
  const f = recovery()
  const model = f.model()
  const wall = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
  try {
    await model.initialize(f.session, f.snapshot)
    wall.mockReturnValue(43_200_000)
    f.setTime(70_000_000)
    const command = (await model.send(order()))!
    expect(commandTime(command)).toBe(70_000_000)
    expect(f.port.currentBinding).toHaveBeenCalledOnce()
  } finally {
    wall.mockRestore()
  }
})

it.each(['sample returned', 'sample failed'])(
  'explains an unsent action when the connection drops during a clock check (%s)',
  async (result) => {
    const f = recovery()
    const model = f.model()
    await model.initialize(f.session, f.snapshot)
    f.advance(60_000)
    f.port.currentBinding.mockImplementationOnce(async (_, request_id) => {
      f.suspend()
      if (result === 'sample failed') throw Error('offline')
      return { ...f.snapshot.candidate, request_id }
    })
    expect(await model.send(order())).toBeUndefined()
    expect(model.store.getState().message).toBe(
      'Connect before confirming an action.',
    )
    expect(f.send).not.toHaveBeenCalled()
    expect(model.ledger.size).toBe(0)
  },
)

it.each(['social', 'alliance'] as const)(
  'restores the complete scoped %s request including its request correlation',
  async (kind) => {
    const f = recovery()
    const run = vi
      .fn()
      .mockRejectedValueOnce(Error('acknowledgement lost'))
      .mockResolvedValue({ status: 'ok' })
    const port: GamePort = {
      ...f.port,
      socialCommand: run,
      allianceCommand: run,
    }
    const model = new Coordinator(port, f.platform)
    await model.initialize(f.session, f.snapshot)
    const command_id = await model.newCommandId()
    const submit =
      kind === 'social'
        ? model.socialCommand({
            command_id,
            action: { type: 'ReadCircular', circular: id(89) },
          })
        : model.allianceCommand({
            command_id,
            expected_revision: null,
            action: { type: 'Join', alliance: id(88) },
          })
    await expect(submit).rejects.toThrow('acknowledgement lost')
    const [firstContext, firstRequest] = run.mock.calls[0]
    expect(firstContext.request_id).not.toBe(command_id)
    const restored = new Coordinator(port, f.platform)
    await restored.initialize(f.session, f.snapshot)
    await restored.reconcilePending()
    expect(run.mock.calls).toEqual([
      [firstContext, firstRequest],
      [firstContext, firstRequest],
    ])
    expect(f.storage.length).toBe(0)
  },
)

it('a changed alliance permission during recovery preserves the uncertain request for the same authenticated binding', async () => {
  const f = recovery()
  const run = vi
    .fn()
    .mockRejectedValueOnce(Error('lost acknowledgement'))
    .mockRejectedValueOnce({ status: 403, code: 'Forbidden' })
    .mockResolvedValue({ status: 'ok' })
  const port: GamePort = { ...f.port, allianceCommand: run }
  const first = new Coordinator(port, f.platform)
  await first.initialize(f.session, f.snapshot)
  const command_id = await first.newCommandId()
  await expect(
    first.allianceCommand({
      command_id,
      expected_revision: null,
      action: { type: 'Join', alliance: id(88) },
    }),
  ).rejects.toThrow('lost acknowledgement')
  const next = new Coordinator(port, f.platform)
  await next.initialize(f.session, f.snapshot)
  await next.reconcilePending()
  expect(next.message).toContain('outcome is unknown')
  expect(f.storage.length).toBe(1)
  await next.reconcilePending()
  expect(run).toHaveBeenCalledTimes(2)
  await next.initialize(f.session, f.snapshot)
  await next.reconcilePending()
  expect(run.mock.calls[2]).toEqual(run.mock.calls[0])
  expect(f.storage.length).toBe(0)
})

it('places the next distinct confirmed action after the expired order refresh lands', async () => {
  const f = recovery()
  const model = f.model()
  await model.initialize(f.session, f.snapshot)
  let release!: (value: Awaited<ReturnType<GamePort['view']>>) => void
  f.view.mockImplementationOnce(
    ({ request_id }) =>
      new Promise((resolve) => {
        release = (next) => resolve({ ...next, request_id })
      }),
  )
  f.send.mockRejectedValueOnce({ status: 409, code: 'COMMAND_EXPIRED' })
  expect(await model.send(order())).toBeUndefined()
  const next = order()
  next.action.name = 'Io'
  const result = model.send(next)
  next.action.name = 'Unconfirmed alteration'
  expect(f.send).toHaveBeenCalledTimes(1)
  release(f.snapshot.view)
  expect(await result).toBeDefined()
  expect(f.send.mock.calls[1][0].command).toMatchObject({
    action: { name: 'Io' },
  })
  expect(f.send.mock.calls[1][0].command_id).not.toBe(
    f.send.mock.calls[0][0].command_id,
  )
})

it.each(['submit', 'receipt', 'legacy lookup'] as const)(
  'waits after a future %s and resends the identical order once the server clock catches up',
  async (source) => {
    const f = recovery()
    f.snapshot.candidate.sampled_at = 100_000
    f.setTime(40_000)
    const model = f.model()
    await model.initialize(f.session, f.snapshot)
    const future = { status: 400, code: 'COMMAND_IN_FUTURE' }
    if (source === 'submit') f.send.mockRejectedValueOnce(future)
    const id = (await model.send(order()))!
    if (source === 'receipt') f.read.mockRejectedValueOnce(future)
    if (source !== 'submit') await model.retryOrder(id)
    expect(f.port.currentBinding).toHaveBeenCalledOnce()
    const reads = f.read.mock.calls.length
    await model.reconcilePending()
    expect(f.read).toHaveBeenCalledTimes(reads)
    expect(f.storage.length).toBe(1)
    expect([...model.ledger.values()][0].status).toBe('uncertain')
    f.advance(30_000)
    f.setTime(70_000)
    f.send.mockImplementationOnce(async (envelope) => ({
      protocol: 4,
      binding: envelope.binding,
      command_id: envelope.command_id,
      status: 'Committed',
      admitted_at: 70_000,
      executed_at: 70_000,
      minimum_viewer_revision: '0',
      result_ids: [],
    }))
    await model.reconcilePending()
    expect(f.send.mock.calls.map(([e]) => e)).toEqual([
      f.send.mock.calls[0][0],
      f.send.mock.calls[0][0],
    ])
    expect(f.storage.length).toBe(0)
  },
)

it.each(['social', 'alliance'] as const)(
  'preserves a future %s envelope through a restarted local clock check',
  async (kind) => {
    const f = recovery()
    f.snapshot.candidate.sampled_at = 100_000
    f.setTime(40_000)
    const run = vi
      .fn()
      .mockRejectedValueOnce({ status: 400, code: 'COMMAND_IN_FUTURE' })
      .mockResolvedValue({ status: 'ok' })
    const port = { ...f.port, socialCommand: run, allianceCommand: run }
    const first = new Coordinator(port, f.platform)
    await first.initialize(f.session, f.snapshot)
    const command_id = await first.newCommandId()
    const submission =
      kind === 'social'
        ? first.socialCommand({
            command_id,
            action: { type: 'ReadCircular', circular: id(29) },
          })
        : first.allianceCommand({
            command_id,
            expected_revision: null,
            action: { type: 'Join', alliance: id(30) },
          })
    await expect(submission).rejects.toMatchObject({
      code: 'COMMAND_IN_FUTURE',
    })
    expect(f.port.currentBinding).toHaveBeenCalledOnce()
    const restored = new Coordinator(port, f.platform)
    await restored.initialize(f.session, f.snapshot)
    await restored.reconcilePending()
    await restored.reconcilePending()
    expect(f.port.currentBinding).toHaveBeenCalledTimes(2)
    expect(f.storage.length).toBe(1)
    expect(run).toHaveBeenCalledTimes(1)
    f.setTime(70_000)
    f.advance(30_000)
    await restored.reconcilePending()
    expect(run.mock.calls).toEqual([run.mock.calls[0], run.mock.calls[0]])
    expect(f.storage.length).toBe(0)
  },
)
