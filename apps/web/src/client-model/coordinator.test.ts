import { describe, expect, it } from 'vitest'
import { Coordinator } from './coordinator'
import {
  currentServerTime,
  pendingConstruction,
  projectGameView,
} from './game-projection'
import type {
  Attempt,
  Binding,
  BoundReceipt,
  BoundView,
  GamePort,
  AttemptStorage,
} from './commands'
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const binding: Binding = {
  account: id(1),
  player: id(2),
  universe: id(3),
  epoch: id(4),
}
const view = (request_id: string, revision = '0'): BoundView => ({
  protocol: 2,
  binding,
  request_id,
  viewer_revision: revision,
  sampled_at: 1000,
  as_of_ms: 1000,
  speed: 1,
  profile_hash: 'a'.repeat(64),
  bodies: [],
  research: [],
  catalog: [],
  capabilities: [],
  constructions: [],
  fleets: [],
  reports: [],
  destinations: [],
  reports_truncated: false,
  destinations_truncated: false,
})
function setup() {
  const saved = new Map<string, Attempt>(),
    sent: string[] = []
  const storage: AttemptStorage = {
    async load() {
      return [...saved.values()]
    },
    async put(a) {
      saved.set(a.envelope.command_id, structuredClone(a))
    },
    async remove(_, id) {
      saved.delete(id)
    },
    async clear() {
      saved.clear()
    },
  }
  const receipts = new Map<string, BoundReceipt>()
  const port: GamePort = {
    async currentBinding(_, request_id) {
      return { protocol: 2, binding, request_id, sampled_at: 1000 }
    },
    async view(c) {
      return view(c.request_id)
    },
    async settings(c) {
      return {
        protocol: 2,
        binding: c.binding,
        request_id: c.request_id,
        profile_hash: 'a'.repeat(64),
        profile_id: 'mvp-v1-slice-1',
        speed: 1,
        galaxies: 1,
        systems_per_galaxy: 5,
        positions_per_system: 15,
      }
    },
    async quote() {
      throw Error('unused')
    },
    async submit(e) {
      sent.push(e.command_id)
      return {
        protocol: 2,
        binding,
        command_id: e.command_id,
        admitted_at: 1000,
        executed_at: null,
        status: 'Pending',
      }
    },
    async receipt(_, id) {
      const r = receipts.get(id)
      if (!r) throw { status: 404 }
      return r
    },
  }
  let n = 10
  const c = new Coordinator(port, storage, {
    newId: () => id(n++),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  })
  return { c, port, storage, saved, sent, receipts }
}
function quotedUpgrade(c: Coordinator) {
  const snapshot = view('snapshot')
  if (snapshot.protocol !== 2) throw Error('fixture protocol')
  snapshot.bodies = [
    {
      id: id(5),
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: { metal: '1000', crystal: '1000', deuterium: '1000' },
      capacity: { metal: '2000', crystal: '2000', deuterium: '2000' },
      levels: {
        MetalMine: 1,
        CrystalMine: 1,
        DeuteriumSynthesizer: 1,
        SolarPlant: 1,
      },
      fields: 100,
      fields_used: 4,
      fields_reserved: 0,
      inventories: [],
      production: { metal: '0', crystal: '0', deuterium: '0' },
      energy: { supply: '10', demand: '5', utilization: '1000000' },
    },
  ]
  c.store.setState({ view: snapshot })
  return {
    command: {
      type: 'StartUpgrade',
      body: id(5),
      building: 'MetalMine',
      expected_terms_hash: 'b'.repeat(64),
    } as const,
    quote: {
      profile_hash: 'a'.repeat(64),
      terms_hash: 'b'.repeat(64),
      cost: { metal: '600', crystal: '100', deuterium: '0' },
      duration: 5000,
      target_level: 2,
      fuel: '0',
      capacity: '0',
      maximum_payload: '0',
    },
  }
}
it('reserves payment before awaiting persistence and blocks repeat or competing spending until reconciliation', async () => {
  const { c, storage, sent } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  let release!: () => void
  storage.put = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const sending = c.send(command, quote)
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '400',
  )
  await c.send(command, quote)
  await c.send({ ...command, building: 'CrystalMine' }, quote)
  expect(c.ledger.size).toBe(1)
  // Complete the initial write; later status writes resolve normally.
  await Promise.resolve()
  await Promise.resolve()
  storage.put = async () => {}
  release()
  await sending
  expect(sent).toHaveLength(1)
})
it('removes the optimistic queue and restores payment after a persistence failure', async () => {
  const { c, storage } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  storage.put = async () => {
    throw Error('disk full')
  }
  await c.send(command, quote)
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '1000',
  )
  expect(pendingConstruction(c.store.getState(), id(5))).toBeNull()
  expect(c.store.getState().intents.size).toBe(0)
})
it('rolls back a server rejection and ignores later pending responses for that command', async () => {
  const { c, port, receipts } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  await c.send(command, quote)
  const attempt = [...c.ledger.values()][0]
  receipts.set(attempt.envelope.command_id, {
    protocol: 2,
    binding,
    command_id: attempt.envelope.command_id,
    admitted_at: 1000,
    executed_at: 1000,
    status: 'Rejected',
    code: 'InsufficientResources',
  })
  let release!: (receipt: BoundReceipt) => void
  const receipt = port.receipt
  port.receipt = () =>
    new Promise((resolve) => {
      release = resolve
    })
  const staleRecovery = c.recover(attempt.envelope.command_id)
  port.receipt = receipt
  await c.recover(attempt.envelope.command_id)
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '1000',
  )
  release({
    protocol: 2,
    binding,
    command_id: attempt.envelope.command_id,
    admitted_at: 1000,
    executed_at: null,
    status: 'Pending',
  })
  await staleRecovery
  expect([...c.ledger.values()][0].status).toBe('rejected')
  expect(pendingConstruction(c.store.getState(), id(5))).toBeNull()
})
it('checks current resource affordability centrally before submitting a stale quoted purchase', async () => {
  const { c, sent } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  c.store.getState().view!.bodies[0].amounts.crystal = '99'
  await c.send(command, quote)
  expect(sent).toHaveLength(0)
  expect(c.ledger.size).toBe(0)
  expect(c.message).toContain('Resources')
})
it('restored uncertain attempts block a competing purchase without needing restored quote metadata', async () => {
  const { c, sent, saved } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  await c.send(command, quote)
  for (const record of saved.values()) {
    delete record.submitted_intent
    record.status = 'uncertain'
    record.receipt = null
  }
  await c.connect(binding.account, binding.universe)
  quotedUpgrade(c)
  expect(c.store.getState().intents.size).toBe(0)
  await c.send({ ...command, building: 'CrystalMine' }, quote)
  expect(sent).toHaveLength(1)
})
it('keeps a pending debit when a newer revision cannot yet be reconciled with its receipt', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  const next = structuredClone(c.view!)
  next.viewer_revision = '1'
  port.view = async (context) => ({ ...next, request_id: context.request_id })
  let receiptReads = 0
  port.receipt = async () => {
    receiptReads++
    throw Error('receipt not requested')
  }
  await c.send(command, quote)
  await c.refresh()
  expect(c.view?.viewer_revision).toBe('0')
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '400',
  )
  expect(pendingConstruction(c.store.getState(), id(5))?.status).toBe('pending')
  expect(receiptReads).toBe(1)
})
it('accepts a newer sample at the submission revision while keeping the debit', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  const next = structuredClone(c.view!)
  next.sampled_at = 1500
  next.as_of_ms = 1500
  port.view = async (context) => ({ ...next, request_id: context.request_id })
  await c.send(command, quote)
  await c.refresh()
  expect(c.view?.as_of_ms).toBe(1500)
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '400',
  )
})
it('defers a snapshot containing the payment until its receipt arrives and never double debits', async () => {
  const { c, port, receipts } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  const next = structuredClone(c.view!)
  next.viewer_revision = '1'
  next.bodies[0].amounts.metal = '400'
  next.bodies[0].amounts.crystal = '900'
  port.view = async (context) => ({ ...next, request_id: context.request_id })
  await c.send(command, quote)
  const amounts: string[] = []
  const stop = c.subscribe((state) =>
    amounts.push(projectGameView(state)!.bodies[0].amounts.metal),
  )
  await c.refresh()
  expect(c.view?.viewer_revision).toBe('0')
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '400',
  )
  const commandId = [...c.ledger.values()][0].envelope.command_id
  receipts.set(commandId, {
    protocol: 2,
    binding,
    command_id: commandId,
    admitted_at: 1000,
    executed_at: 1000,
    status: 'Committed',
    minimum_viewer_revision: '1',
    result_ids: [id(40)],
  })
  await c.poll()
  expect(c.view?.viewer_revision).toBe('1')
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '400',
  )
  expect(amounts.length).toBeGreaterThan(0)
  expect(amounts.every((amount) => amount === '400')).toBe(true)
  stop()
})
it('keeps a cancellation refund across unrelated revisions and applies the confirmed refund only once', async () => {
  const { c, port, receipts } = setup()
  await c.connect(binding.account, binding.universe)
  quotedUpgrade(c)
  c.view!.constructions = [
    {
      id: id(40),
      body: id(5),
      building: 'MetalMine',
      target_level: 2,
      due_at: 6000,
      paid: { metal: '600', crystal: '100', deuterium: '0' },
    },
  ]
  const next = structuredClone(c.view!)
  next.viewer_revision = '1'
  port.view = async (context) => ({ ...next, request_id: context.request_id })
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  await c.refresh()
  expect(c.view?.viewer_revision).toBe('0')
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '1600',
  )
  expect(projectGameView(c.store.getState())?.constructions).toEqual([])
  next.viewer_revision = '2'
  next.constructions = []
  next.bodies[0].amounts.metal = '1600'
  next.bodies[0].amounts.crystal = '1100'
  await c.refresh()
  expect(c.view?.viewer_revision).toBe('0')
  const commandId = [...c.ledger.values()][0].envelope.command_id
  receipts.set(commandId, {
    protocol: 2,
    binding,
    command_id: commandId,
    admitted_at: 1000,
    executed_at: 1000,
    status: 'Committed',
    minimum_viewer_revision: '2',
    result_ids: [],
  })
  await c.poll()
  expect(c.view?.viewer_revision).toBe('2')
  expect(projectGameView(c.store.getState())?.bodies[0].amounts.metal).toBe(
    '1600',
  )
})
it('prunes old acknowledged successes without dropping unresolved actions or blocking future commands', async () => {
  const { c, port, saved, sent } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(999) })
  const pendingId = [...c.ledger.values()][0].envelope.command_id
  port.submit = async (envelope) => {
    sent.push(envelope.command_id)
    return {
      protocol: 2,
      binding,
      command_id: envelope.command_id,
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Rejected',
      code: 'OperationNotActive',
    }
  }
  await c.send({ type: 'CancelConstruction', operation: id(998) })
  port.submit = async (envelope) => {
    sent.push(envelope.command_id)
    return {
      protocol: 2,
      binding,
      command_id: envelope.command_id,
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Committed',
      result_ids: [],
      minimum_viewer_revision: '1',
    }
  }
  port.view = async (context) => view(context.request_id, '1')
  for (let i = 0; i < 140; i++)
    await c.send({ type: 'CancelConstruction', operation: id(1000 + i) })
  expect(sent).toHaveLength(142)
  expect(c.ledger.size).toBeLessThanOrEqual(10)
  expect(saved.size).toBeLessThanOrEqual(10)
  expect(
    [...c.ledger.values()].filter((attempt) => attempt.status === 'rejected'),
  ).toHaveLength(1)
  expect(
    [...c.ledger.values()].find((a) => a.envelope.command_id === pendingId)
      ?.status,
  ).toBe('pending')
})
describe('R1 attempt coordinator', () => {
  it('publishes game and attempt updates through one immutable Zustand store and clears it on logout', async () => {
    const { c, port } = setup()
    expect(c.store).toBeDefined()
    await c.connect(binding.account, binding.universe)
    const connected = c.store.getState()
    const snapshots: (typeof connected)[] = []
    const stop = c.store.subscribe((state) => snapshots.push(state))
    await c.send({ type: 'CancelConstruction', operation: id(40) })
    expect(connected.attempts.size).toBe(0)
    expect(c.store.getState().attempts.size).toBe(1)
    expect(
      snapshots.some((s) =>
        [...s.attempts.values()].some((a) => a.status === 'submitting'),
      ),
    ).toBe(true)
    expect([...c.store.getState().attempts.values()][0].status).toBe('pending')
    port.view = async (context) => view(context.request_id, '2')
    await c.refresh()
    expect(c.store.getState().view?.viewer_revision).toBe('2')
    expect(connected.view?.viewer_revision).toBe('0')
    await c.logout()
    expect(c.store.getState()).toMatchObject({
      view: null,
      settings: null,
      binding: null,
      ready: false,
    })
    expect(c.store.getState().attempts.size).toBe(0)
    stop()
  })
  it('keeps independent immutable A/B envelopes and retries only the same ID after 404', async () => {
    const { c, saved, sent } = setup()
    await c.connect(binding.account, binding.universe)
    await c.send({ type: 'CancelConstruction', operation: id(40) })
    await c.send({ type: 'CancelConstruction', operation: id(41) })
    expect(c.ledger.size).toBe(2)
    expect(saved.size).toBe(2)
    const a = [...c.ledger.values()][0]
    await c.recover(a.envelope.command_id)
    expect(sent).toEqual([sent[0], sent[1], sent[0]])
  })
  it('reconciles receipt revision 12 only against a confirmed view >=12', async () => {
    const { c, port, receipts } = setup()
    await c.connect(binding.account, binding.universe)
    await c.send({ type: 'CancelConstruction', operation: id(40) })
    const a = [...c.ledger.values()][0]
    receipts.set(a.envelope.command_id, {
      protocol: 2,
      binding,
      command_id: a.envelope.command_id,
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Committed',
      result_ids: [],
      minimum_viewer_revision: '12',
    })
    port.view = async (ctx) => view(ctx.request_id, '11')
    await c.recover(a.envelope.command_id)
    expect([...c.ledger.values()][0].reconciled).toBe(false)
    port.view = async (ctx) => view(ctx.request_id, '12')
    await c.refresh()
    expect([...c.ledger.values()][0].reconciled).toBe(true)
  })
  it('blocks sending if persistence fails', async () => {
    const { c, storage, sent } = setup()
    await c.connect(binding.account, binding.universe)
    storage.put = async () => {
      throw Error('quota')
    }
    await c.send({ type: 'CancelConstruction', operation: id(40) })
    expect(sent).toEqual([])
    expect(c.message).toContain('save')
  })
})
it('reload preserves both accepted attempts and queries receipts before retrying their original IDs', async () => {
  const { c, sent } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  await c.send({ type: 'CancelConstruction', operation: id(41) })
  await c.connect(binding.account, binding.universe)
  expect([...c.ledger.values()].map((a) => a.status)).toEqual([
    'pending',
    'pending',
  ])
  expect(sent).toHaveLength(2)
  await c.poll()
  expect(sent).toHaveLength(4)
})
it('a B receipt cannot resolve A and a view cannot infer commitment', async () => {
  const { c, receipts, port } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  await c.send({ type: 'CancelConstruction', operation: id(41) })
  const [a, b] = [...c.ledger.values()]
  receipts.set(a.envelope.command_id, {
    protocol: 2,
    binding,
    command_id: b.envelope.command_id,
    admitted_at: 1000,
    executed_at: 1000,
    status: 'Committed',
    result_ids: [],
    minimum_viewer_revision: '1',
  })
  await c.recover(a.envelope.command_id)
  port.view = async (ctx) => view(ctx.request_id, '20')
  await c.refresh()
  expect([...c.ledger.values()].map((a) => a.status)).toEqual([
    'pending',
    'pending',
  ])
})
it('drops late session callbacks and late discovery candidates', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  let finish!: (r: BoundReceipt) => void, started!: () => void
  const admitted = new Promise<void>((resolve) => {
    started = resolve
  })
  port.submit = () =>
    new Promise((resolve) => {
      finish = resolve
      started()
    })
  const send = c.send({ type: 'CancelConstruction', operation: id(40) })
  await admitted
  const a = [...c.ledger.values()][0]
  c.invalidate()
  finish({
    protocol: 2,
    binding,
    command_id: a.envelope.command_id,
    admitted_at: 1000,
    executed_at: 1000,
    status: 'Committed',
    result_ids: [],
    minimum_viewer_revision: '1',
  })
  await send
  expect(c.ledger.size).toBe(0)
  expect(c.view).toBeNull()
})
it('reset between discovery and confirmation rediscovers and never submits old work', async () => {
  const { c, port, sent, saved } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  const next = { ...binding, epoch: id(99), player: id(98) }
  let confirmations = 0
  port.currentBinding = async (_, request_id) => ({
    protocol: 2,
    binding: confirmations ? next : binding,
    request_id,
    sampled_at: 1000,
  })
  port.view = async (ctx) => {
    confirmations++
    if (ctx.binding.epoch === binding.epoch)
      throw { code: 'EpochChanged', status: 409 }
    return { ...view(ctx.request_id), binding: next }
  }
  await c.connect(binding.account, binding.universe)
  expect(c.binding).toEqual(next)
  expect(c.ready).toBe(true)
  expect(c.ledger.size).toBe(0)
  expect(saved.size).toBe(1)
  expect(sent).toHaveLength(1)
})
it('rejects higher revision with older sample and permits equal revision newer samples', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  port.view = async (ctx) => ({ ...view(ctx.request_id, '1'), as_of_ms: 999 })
  await c.refresh()
  expect(c.view?.viewer_revision).toBe('0')
  port.view = async (ctx) => ({
    ...view(ctx.request_id),
    as_of_ms: 1001,
    sampled_at: 1001,
  })
  await c.refresh()
  expect(c.view?.as_of_ms).toBe(1001)
})
it('a fresh login cannot automatically recover stored intent from an earlier session', async () => {
  const { c, port, storage, sent } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  const fresh = new Coordinator(
    port,
    storage,
    { newId: () => id(90), monotonicNowMs: () => 0, isOnline: () => true },
    false,
  )
  await fresh.connect(binding.account, binding.universe)
  await fresh.poll()
  expect(fresh.ledger.size).toBe(0)
  expect(sent).toHaveLength(1)
})
it('normal quote resource 404 preserves the confirmed session', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  port.quote = async () => {
    throw { status: 404, code: 'NotFound' }
  }
  await expect(
    c.quote({ type: 'Upgrade', body: id(40), building: 'MetalMine' }),
  ).rejects.toMatchObject({ status: 404 })
  expect(c.ready).toBe(true)
  expect(c.binding).toEqual(binding)
  expect(c.accessLost).toBe(false)
})
it('old refresh and quote failures cannot invalidate newer successful requests', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  let fail!: (e: unknown) => void
  port.view = () =>
    new Promise((_, reject) => {
      fail = reject
    })
  const old = c.refresh()
  port.view = async (ctx) => view(ctx.request_id, '2')
  await c.refresh()
  fail({ status: 401 })
  await old
  expect(c.ready).toBe(true)
  expect(c.view?.viewer_revision).toBe('2')
  port.quote = () =>
    new Promise((_, reject) => {
      fail = reject
    })
  const oldQuote = c.quote({
    type: 'Upgrade',
    body: id(40),
    building: 'MetalMine',
  })
  // A later quote also fails normally; only the latest request may affect presentation.
  port.quote = async () => {
    throw { status: 422, code: 'GameRejected' }
  }
  await c
    .quote({ type: 'Upgrade', body: id(41), building: 'MetalMine' })
    .catch(() => {})
  fail({ status: 401 })
  await oldQuote.catch(() => {})
  expect(c.ready).toBe(true)
})
it('invalidation during reconciliation cannot resurrect a second old attempt', async () => {
  const { c, port, storage, receipts } = setup()
  await c.connect(binding.account, binding.universe)
  for (const n of [40, 41])
    await c.send({ type: 'CancelConstruction', operation: id(n) })
  for (const a of c.ledger.values()) {
    receipts.set(a.envelope.command_id, {
      protocol: 2,
      binding,
      command_id: a.envelope.command_id,
      admitted_at: 1000,
      executed_at: 1000,
      status: 'Committed',
      result_ids: [],
      minimum_viewer_revision: '12',
    })
    await c.recover(a.envelope.command_id)
  }
  let release!: () => void, started!: () => void
  const writing = new Promise<void>((r) => {
    started = r
  })
  const original = storage.put
  storage.put = async (a) => {
    if (a.reconciled) {
      started()
      await new Promise<void>((r) => {
        release = r
      })
    }
    await original(a)
  }
  port.view = async (ctx) => view(ctx.request_id, '12')
  const refresh = c.refresh()
  await writing
  c.invalidate()
  storage.put = original
  release()
  await refresh
  expect(c.binding).toBeNull()
  expect(c.ledger.size).toBe(0)
})
it('receipt polling stops the batch and honors Retry-After before any retry', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  for (const n of [40, 41])
    await c.send({ type: 'CancelConstruction', operation: id(n) })
  let polls = 0,
    views = 0
  port.receipt = async () => {
    polls++
    throw { status: 429, code: 'RateLimited', retryAfterMs: 60000 }
  }
  port.view = async (ctx) => {
    views++
    return view(ctx.request_id)
  }
  await c.poll()
  await c.poll()
  expect(polls).toBe(1)
  expect(views).toBe(0)
})

it('confirms settings with the view and clears them on logout', async () => {
  const { c } = setup()
  await c.connect(binding.account, binding.universe)
  expect(c.settings?.systems_per_galaxy).toBe(5)
  await c.logout()
  expect(c.settings).toBeNull()
})

it('discards delayed settings from a logged-out session', async () => {
  const { c, port } = setup()
  let release!: (value: Awaited<ReturnType<GamePort['settings']>>) => void
  let requested!: () => void
  const waiting = new Promise<void>((resolve) => {
    requested = resolve
  })
  const original = port.settings
  let context!: Parameters<GamePort['settings']>[0]
  port.settings = async (c) => {
    context = c
    requested()
    return new Promise((resolve) => {
      release = resolve
    })
  }
  const connecting = c.connect(binding.account, binding.universe)
  await waiting
  await c.logout()
  release(await original(context))
  await connecting
  expect(c.settings).toBeNull()
  expect(c.view).toBeNull()
  expect(c.ready).toBe(false)
})

it('rejects settings from a different profile before restoring pending intents', async () => {
  const { c, port, sent } = setup()
  const original = port.settings
  port.settings = async (context) => ({
    ...(await original(context)),
    profile_hash: 'b'.repeat(64),
  })
  await c.connect(binding.account, binding.universe)
  expect(c.ready).toBe(false)
  expect(c.settings).toBeNull()
  expect(sent).toEqual([])
})

it('initialization restores saved command identities without startup network reads', async () => {
  const { c, port, storage, sent } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(40) })
  const snapshot = {
    request_id: id(80),
    candidate: await port.currentBinding(binding.universe, id(80)),
    view: await port.view({ binding, request_id: id(80) }),
    settings: await port.settings({ binding, request_id: id(80) }),
  }
  port.currentBinding = async () => {
    throw Error('startup discovery')
  }
  port.view = async () => {
    throw Error('startup overview')
  }
  port.settings = async () => {
    throw Error('startup settings')
  }
  const next = new Coordinator(port, storage, {
    newId: () => id(90),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  })
  await next.initialize(
    {
      account: binding.account,
      csrf: 'csrf',
      expires_at: 9999999999999,
      memberships: [
        {
          universe_name: 'Andromeda',
          universe: binding.universe,
          player: binding.player,
        },
      ],
    },
    snapshot,
  )
  expect(next.ready).toBe(true)
  expect([...next.ledger.values()][0].envelope.command_id).toBe(sent[0])
  expect([...next.ledger.values()][0].status).toBe('pending')
  expect(sent).toHaveLength(1)
})

it('anchors initialized snapshots to receipt time and clears previous optimistic inputs on reinitialization', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(2)
  const { c, port, storage } = setup()
  const { command, quote } = quotedUpgrade(c)
  if (snapshot.view.protocol !== 2 || c.view?.protocol !== 2)
    throw Error('fixture protocol')
  snapshot.view.bodies = structuredClone(c.view.bodies)
  snapshot.view.bodies[0].production.metal = '3600000'
  snapshot.view.progress = {
    sampled_at: 1000,
    scopes: [],
    minimum_revision_pending: false,
    projection_limit: null,
  }
  let now = 25000,
    sequence = 100
  const model = new Coordinator(
    port,
    storage,
    {
      newId: () => id(sequence++),
      monotonicNowMs: () => now,
      isOnline: () => true,
    },
    false,
  )
  await model.initialize(session, snapshot)
  expect(currentServerTime(model.store.getState())).toBe(1000)
  expect(projectGameView(model.store.getState())?.bodies[0].amounts.metal).toBe(
    '1000',
  )
  now = 25500
  model.tick()
  expect(currentServerTime(model.store.getState())).toBe(1500)
  expect(projectGameView(model.store.getState())?.bodies[0].amounts.metal).toBe(
    '1500',
  )
  await model.send(command, quote)
  expect(model.store.getState().intents.size).toBe(1)
  now = 30000
  await model.initialize(session, snapshot)
  expect(model.store.getState().intents.size).toBe(0)
  expect(currentServerTime(model.store.getState())).toBe(1000)
  expect(projectGameView(model.store.getState())?.bodies[0].amounts.metal).toBe(
    '1000',
  )
})

it('shares the in-flight Login request across repeated lifecycle starts', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(4)
  const { port, storage } = setup()
  let release!: (receipt: BoundReceipt) => void
  const pending = new Promise<BoundReceipt>((resolve) => {
    release = resolve
  })
  const submitted: import('./commands').Envelope[] = []
  port.submit = async (envelope) => {
    submitted.push(envelope)
    return pending
  }
  const model = new Coordinator(port, storage, {
    newId: () => id(90),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  })
  await model.initialize(session, snapshot)
  const first = model.recordLogin(),
    second = model.recordLogin()
  let secondSettled = false
  void second.then(() => {
    secondSettled = true
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  expect(secondSettled).toBe(false)
  expect(submitted).toHaveLength(1)
  release({
    protocol: 4,
    binding: snapshot.candidate.binding,
    command_id: id(90),
    admitted_at: 1000,
    executed_at: null,
    status: 'Pending',
  })
  await first
  await second
  expect(secondSettled).toBe(true)
  await model.recordLogin()
  expect(submitted).toHaveLength(1)
})

it('retains durable acceptance after a receipt transport failure', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(50) })
  const commandId = [...c.ledger.values()][0].envelope.command_id
  port.receipt = async () => {
    throw { status: 503 }
  }
  await c.recover(commandId)
  expect([...c.ledger.values()][0].status).toBe('pending')
  expect([...c.ledger.values()][0].receipt?.status).toBe('Pending')
})
it('restores accepted immutable prediction inputs without resubmitting or double debiting', async () => {
  const { c, port, storage, saved, sent } = setup()
  await c.connect(binding.account, binding.universe)
  const { command, quote } = quotedUpgrade(c)
  const confirmed = structuredClone(c.view!)
  await c.send(command, quote)
  expect([...saved.values()][0]).toHaveProperty('submitted_intent.quote', quote)
  port.view = async (context) => ({
    ...confirmed,
    request_id: context.request_id,
  })
  const restored = new Coordinator(port, storage, {
    newId: () => id(90),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  })
  await restored.connect(binding.account, binding.universe)
  expect([...restored.ledger.values()][0].status).toBe('pending')
  expect(
    projectGameView(restored.store.getState())?.bodies[0].amounts.metal,
  ).toBe('400')
  expect(sent).toHaveLength(1)
})
it('applies duplicate outcome updates once and coalesces invalidations at the largest revision', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  await c.send({ type: 'CancelConstruction', operation: id(50) })
  const commandId = [...c.ledger.values()][0].envelope.command_id
  const revisions: (string | undefined)[] = []
  port.view = async (context, minimum) => {
    revisions.push(minimum)
    return view(context.request_id, minimum ?? '0')
  }
  const update = {
    binding,
    cursor: 'one',
    event: {
      type: 'Outcome' as const,
      receipt: {
        protocol: 2 as const,
        binding,
        command_id: commandId,
        admitted_at: 1000,
        executed_at: 1000,
        status: 'Committed' as const,
        result_ids: [],
        minimum_viewer_revision: '2',
      },
    },
  }
  await c.onUpdate(update)
  await c.onUpdate(update)
  expect([...c.ledger.values()][0]).toMatchObject({
    status: 'committed',
    reconciled: true,
  })
  expect(revisions).toEqual(['2'])
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  port.view = async (context, minimum) => {
    revisions.push(minimum)
    if (minimum === '3') await wait
    return view(context.request_id, minimum!)
  }
  const first = c.onUpdate({
    binding,
    cursor: 'two',
    event: { type: 'Invalidate', minimum_viewer_revision: '3' },
  })
  const latest = c.onUpdate({
    binding,
    cursor: 'three',
    event: { type: 'Invalidate', minimum_viewer_revision: '5' },
  })
  release()
  await Promise.all([first, latest])
  expect(revisions).toEqual(['2', '3', '5'])
  expect(c.view?.viewer_revision).toBe('5')
  await c.onUpdate({
    binding,
    cursor: 'old',
    event: { type: 'Invalidate', minimum_viewer_revision: '4' },
  })
  expect(revisions).toHaveLength(3)
})

it('does not start fast recovery while Login submission is still in flight', async () => {
  const { vi } = await import('vitest')
  vi.useFakeTimers()
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(4)
  const { port, storage } = setup()
  let release!: (receipt: BoundReceipt) => void
  port.submit = () =>
    new Promise((resolve) => {
      release = resolve
    })
  port.view = vi.fn(async (context) => ({
    ...snapshot.view,
    request_id: context.request_id,
  }))
  port.receipt = vi.fn(
    async (): Promise<BoundReceipt> => ({
      protocol: 4,
      binding: snapshot.candidate.binding,
      command_id: id(90),
      admitted_at: 1000,
      executed_at: null,
      status: 'Pending',
    }),
  )
  const model = new Coordinator(
    port,
    storage,
    {
      newId: () => id(90),
      monotonicNowMs: () => Date.now(),
      isOnline: () => true,
      random: () => 0,
      scheduleOnce(callback, delay) {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      },
    },
    true,
    {
      async subscribe() {
        throw { status: 404 }
      },
    },
  )
  await model.initialize(session, snapshot)
  const stop = model.startDelivery()
  try {
    const login = model.recordLogin()
    await vi.advanceTimersByTimeAsync(2000)
    expect(port.receipt).not.toHaveBeenCalled()
    expect(port.view).not.toHaveBeenCalled()
    release({
      protocol: 4,
      binding: snapshot.candidate.binding,
      command_id: id(90),
      admitted_at: 1000,
      executed_at: null,
      status: 'Pending',
    })
    await login
    await vi.advanceTimersByTimeAsync(1000)
    expect(port.receipt).toHaveBeenCalledTimes(1)
  } finally {
    stop()
    vi.useRealTimers()
  }
})

it('retains a required revision across backoff and a still-behind snapshot', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(2)
  const { port, storage } = setup()
  let now = 0
  let fail = true
  let revision = '4'
  const requested: (string | undefined)[] = []
  const model = new Coordinator(port, storage, {
    newId: () => id(90),
    monotonicNowMs: () => now,
    isOnline: () => true,
  })
  await model.initialize(session, snapshot)
  port.view = async (context, minimum) => {
    requested.push(minimum)
    if (fail) throw { status: 503, retryAfterMs: 100 }
    return view(context.request_id, revision)
  }
  await model.refresh()
  await model.refresh('5')
  expect(requested).toEqual([undefined])
  fail = false
  now = 100
  await model.refresh()
  expect(requested).toEqual([undefined, '5'])
  revision = '5'
  await model.refresh()
  expect(requested).toEqual([undefined, '5', '5'])
  await model.refresh()
  expect(requested.at(-1)).toBeUndefined()
})

it('preserves the required revision when manual refresh supersedes an in-flight request', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requested: (string | undefined)[] = []
  port.view = async (context, minimum) => {
    requested.push(minimum)
    if (requested.length === 1) await gate
    return view(context.request_id, requested.length === 2 ? '4' : '5')
  }
  const first = c.refresh('5')
  await c.refresh()
  expect(requested).toEqual(['5', '5'])
  release()
  await first
  await c.poll()
  expect(requested.at(-1)).toBe('5')
  expect(c.view?.viewer_revision).toBe('5')
})

it('reconciles unread report alerts from live invalidations and reconnect snapshots', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(4)
  const { port, storage } = setup()
  let unread = false
  let revision = BigInt(snapshot.view.viewer_revision)
  port.view = async (context) => ({
    ...snapshot.view,
    request_id: context.request_id,
    viewer_revision: String(revision),
    has_unread_reports: unread,
  })
  const model = new Coordinator(port, storage, {
    newId: () => id(90),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  })
  await model.initialize(session, snapshot)
  for (const next of [true, false]) {
    unread = next
    revision++
    await model.onUpdate({
      binding: snapshot.candidate.binding,
      cursor: String(revision),
      event: { type: 'Invalidate', minimum_viewer_revision: String(revision) },
    })
    expect(model.view).toMatchObject({ has_unread_reports: next })
  }
  unread = true
  revision++
  await model.poll()
  expect(model.view).toMatchObject({ has_unread_reports: true })
  model.invalidate()
  expect(model.store.getState().view).toBeNull()
})

it.each(['none', 'remove', 'write'])(
  'does not resurrect report failures after pruning a successful retry (storage failure: %s)',
  async (failureMode) => {
    const { readyFixture } = await import('../test-support/bootstrap')
    const { mergeReportHeaders } = await import('./report-state')
    const { session, snapshot } = readyFixture(4)
    const { c, port, storage, saved } = setup()
    await c.initialize(session, snapshot)
    const report = id(700),
      other = id(701)
    c.store.setState({
      reportHeaders: mergeReportHeaders(
        new Map(),
        [report, other].map((id) => ({
          id,
          hidden: false,
          read: true,
          observed_at: 1000,
          kind: 'Espionage',
        })),
        '1',
      ),
    })
    let reject = true
    const put = storage.put
    storage.put = async (attempt) => {
      if (failureMode === 'write' && attempt.status === 'rejected')
        throw Error('status write failed')
      await put(attempt)
    }
    port.submit = async (envelope) =>
      ({
        protocol: 4,
        binding: snapshot.candidate.binding,
        command_id: envelope.command_id,
        admitted_at: 1000,
        executed_at: 1000,
        ...(reject
          ? { status: 'Rejected', code: 'NotFound' }
          : {
              status: 'Committed',
              result_ids: [],
              minimum_viewer_revision: '2',
            }),
      }) as BoundReceipt
    port.view = async (context) => ({
      ...snapshot.view,
      request_id: context.request_id,
      viewer_revision: '2',
    })
    const change = (report: string, hidden = true) =>
      c.send({
        type: 'World',
        action: { type: 'SetReportHidden', report, hidden },
      })
    const failure = await change(report)
    const otherFailure = await change(other)
    const unrelated = await change(id(702))
    const remove = storage.remove
    storage.remove = async (binding, id) => {
      if (failureMode === 'remove' && id === failure)
        throw Error('storage unavailable')
      await remove(binding, id)
    }
    reject = false
    const retry = await change(report)
    for (let i = 0; i < 10; i++) await change(other, i % 2 === 0)
    if (failureMode === 'remove') {
      expect(saved.has(failure!)).toBe(true)
      expect(
        [...c.ledger.values()].some((a) => a.envelope.command_id === retry),
      ).toBe(true)
      storage.remove = remove
      await c.refresh()
    }
    expect(saved.has(failure!)).toBe(false)
    expect(saved.has(retry!)).toBe(false)
    expect(saved.has(otherFailure!)).toBe(false)
    expect(saved.has(unrelated!)).toBe(true)
    expect(
      [...c.ledger.values()]
        .filter((a) => a.status === 'rejected')
        .map((a) => a.envelope.command_id),
    ).toEqual([unrelated])
    reject = true
    storage.put = put
    const latestFailure = await change(report, false)
    await c.refresh()
    expect(saved.has(latestFailure!)).toBe(true)
  },
)

it('discards simulation responses from a changed identity, request or rules profile', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(4)
  for (const mismatch of ['request', 'binding', 'rules', 'session'] as const) {
    const { c, port } = setup()
    await c.initialize(session, snapshot)
    port.simulate = async (context) => {
      if (mismatch === 'session') await c.initialize(session, snapshot)
      return {
        binding:
          mismatch === 'binding'
            ? { ...context.binding, player: id(999) }
            : context.binding,
        request_id: mismatch === 'request' ? id(999) : context.request_id,
        profile_hash: (mismatch === 'rules' ? 'b' : 'a').repeat(64),
        loot_rules_enabled: true,
        samples: Array.from({ length: 10 }, () => ({
          surviving_cargo_capacity: '0',
          estimated_loot: null,
          outcome: 'AttackerVictory' as const,
          rounds: 0,
          attacker: [],
          defender: [],
        })),
      }
    }
    await expect(
      c.simulate({
        attacker: { technology: [0, 0, 0], units: [] },
        defender: { technology: [0, 0, 0], units: [] },
      }),
    ).rejects.toThrow('universe changed')
  }
})

it('alliance not-found and permission errors stay local to the screen', async () => {
  const { readyFixture } = await import('../test-support/bootstrap')
  const { session, snapshot } = readyFixture(4)
  for (const status of [403, 404]) {
    const { c, port } = setup()
    await c.initialize(session, snapshot)
    const before = c.view
    port.allianceQuery = async () => {
      throw { status, code: 'NotFound' }
    }
    await expect(
      c.allianceQuery({ type: 'Detail', alliance: id(999), post_before: null }),
    ).rejects.toMatchObject({ status })
    expect(c.ready).toBe(true)
    expect(c.view).toBe(before)
    port.allianceCommand = async () => {
      throw { status, code: 'NotFound' }
    }
    await expect(
      c.allianceCommand({
        command_id: id(998),
        expected_revision: 1,
        action: { type: 'Leave', alliance: id(999) },
      }),
    ).rejects.toMatchObject({ status })
    expect(c.ready).toBe(true)
    expect(c.view).toBe(before)
  }
})

it('refreshes speed and settings atomically after a rules activation', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  const oldSettings = port.settings
  const originalView = port.view
  let calls = 0
  port.settings = async (context) => {
    calls++
    return {
      ...(await oldSettings(context)),
      profile_hash: 'b'.repeat(64),
      speed: 3,
    }
  }
  await c.refresh()
  expect(calls).toBe(0)
  port.view = async (context) => ({
    ...(await originalView(context)),
    viewer_revision: '1',
    profile_hash: 'b'.repeat(64),
    speed: 3,
  })
  const mismatches: boolean[] = []
  const unsubscribe = c.store.subscribe(({ view, settings }) => {
    if (view && settings)
      mismatches.push(
        view.profile_hash !== settings.profile_hash ||
          view.speed !== settings.speed,
      )
  })
  await c.refresh('1')
  unsubscribe()
  expect(calls).toBe(1)
  expect(c.view?.speed).toBe(3)
  expect(c.settings?.speed).toBe(3)
  expect(mismatches).not.toContain(true)
  expect(c.stale).toBe(false)
})

it('retains a coherent snapshot if rules change again between view and settings', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  const oldView = c.view
  const originalSettings = port.settings
  port.view = async (context) => ({
    ...view(context.request_id, '1'),
    profile_hash: 'b'.repeat(64),
    speed: 3,
  })
  port.settings = async (context) => ({
    ...(await originalSettings(context)),
    profile_hash: 'c'.repeat(64),
    speed: 4,
  })
  await c.refresh('1')
  expect(c.view).toBe(oldView)
  expect(c.settings?.speed).toBe(1)
  expect(c.stale).toBe(true)
  port.settings = async (context) => ({
    ...(await originalSettings(context)),
    profile_hash: 'b'.repeat(64),
    speed: 3,
  })
  await c.refresh('1')
  expect(c.view?.speed).toBe(3)
  expect(c.settings?.speed).toBe(3)
  expect(c.stale).toBe(false)
})

it('discards a rules refresh whose settings finish after logout', async () => {
  const { c, port } = setup()
  await c.connect(binding.account, binding.universe)
  const originalSettings = port.settings
  let release!: () => void
  let requested!: () => void
  const waiting = new Promise<void>((resolve) => {
    requested = resolve
  })
  port.view = async (context) => ({
    ...view(context.request_id, '1'),
    profile_hash: 'b'.repeat(64),
    speed: 3,
  })
  port.settings = async (context) => {
    requested()
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return {
      ...(await originalSettings(context)),
      profile_hash: 'b'.repeat(64),
      speed: 3,
    }
  }
  const refreshing = c.refresh('1')
  await waiting
  await c.logout()
  release()
  await refreshing
  expect(c.view).toBeNull()
  expect(c.settings).toBeNull()
})
