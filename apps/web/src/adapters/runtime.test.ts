import { it, expect, vi } from 'vitest'
import {
  prepareRuntime,
  loadInitialRuntime,
  type RuntimeDependencies,
} from './runtime'
import { PendingCommands } from '../client-model/pending-commands'
import { bootstrapFixture, id, memoryStorage } from '../test-support/bootstrap'
const dependencies = (): RuntimeDependencies => ({
  platform: {
    newId: () => id(90),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  },
  createPort: () => ({
    currentBinding: vi.fn(() => {
      throw Error('network')
    }),
    view: vi.fn(() => {
      throw Error('network')
    }),
    settings: vi.fn(() => {
      throw Error('network')
    }),
    submit: vi.fn(() => {
      throw Error('network')
    }),
    receipt: vi.fn(() => {
      throw Error('network')
    }),
    quote: vi.fn(() => {
      throw Error('network')
    }),
  }),
  readEmbedded: () => bootstrapFixture(),
  fetchBootstrap: vi.fn(async () => bootstrapFixture()),
})
it('public invitation entry resolves a fresh authenticated session despite anonymous embedded data', async () => {
  const deps = dependencies()
  deps.readEmbedded = vi.fn<RuntimeDependencies['readEmbedded']>(() => ({
    version: 1,
    signup_enabled: false,
    result: { status: 'anonymous' },
  }))
  const authenticated = bootstrapFixture()
  if (authenticated.result.status !== 'authenticated') throw Error('fixture')
  authenticated.result.session.memberships = []
  authenticated.result.game = { status: 'no_membership' }
  deps.fetchBootstrap = vi.fn(async () => authenticated)
  const runtime = await loadInitialRuntime(deps, true)
  expect(runtime.status).toBe('authenticated')
  if (runtime.status !== 'authenticated')
    throw Error('authenticated session required')
  expect(runtime.session.memberships).toEqual([])
  expect(runtime.game.status).toBe('no_membership')
  expect(deps.readEmbedded).not.toHaveBeenCalled()
  expect(deps.fetchBootstrap).toHaveBeenCalledOnce()
})
it('adopts embedded data without requesting startup data or retaining a second snapshot', async () => {
  const deps = dependencies()
  const runtime = await loadInitialRuntime(deps)
  expect(deps.fetchBootstrap).not.toHaveBeenCalled()
  expect(runtime.status).toBe('authenticated')
  if (runtime.status === 'authenticated' && runtime.game.status === 'ready') {
    expect(runtime.game.model.ready).toBe(true)
    expect(runtime.game.model.view?.binding.account).toBe(id(1))
    expect('snapshot' in runtime.game).toBe(false)
  }
})
it('fetches once for a missing payload and retains uncertainty on failure', async () => {
  const deps = dependencies()
  deps.readEmbedded = () => null
  deps.fetchBootstrap = vi.fn(async () => {
    throw Error('offline')
  })
  expect((await loadInitialRuntime(deps)).status).toBe('unavailable')
  expect(deps.fetchBootstrap).toHaveBeenCalledTimes(1)
})
it('wrong-principal data is never activated', async () => {
  const payload = bootstrapFixture()
  if (payload.result.status === 'authenticated')
    payload.result.session.account = id(99)
  const r = await prepareRuntime(payload, 'login', dependencies())
  if (r.status === 'authenticated')
    expect(r.game).toEqual({ status: 'unavailable', code: 'InvalidBootstrap' })
  else throw Error('lost auth')
})

it('reload restores only the unresolved envelope alongside the authoritative server snapshot', async () => {
  const deps = dependencies()
  const storage = memoryStorage()
  deps.platform.pendingCommands = new PendingCommands(() => storage)
  const port = deps.createPort('csrf', {} as never)
  deps.createPort = () => port
  const payload = bootstrapFixture()
  const first = await prepareRuntime(payload, 'document', deps)
  if (first.status !== 'authenticated' || first.game.status !== 'ready')
    throw Error('runtime')
  await first.game.model.send({ type: 'CancelConstruction', operation: id(76) })
  expect([...first.game.model.ledger.values()][0].status).toBe('uncertain')
  const fresh = await prepareRuntime(payload, 'document', deps)
  if (fresh.status !== 'authenticated' || fresh.game.status !== 'ready')
    throw Error('runtime')
  await fresh.game.model.reconcilePending()
  expect([...fresh.game.model.ledger.values()][0].envelope).toEqual(
    [...first.game.model.ledger.values()][0].envelope,
  )
  expect(fresh.game.model.store.getState().intents.size).toBe(0)
  expect(fresh.game.model.ready).toBe(true)
  expect(port.receipt).toHaveBeenCalledOnce()
  expect(port.submit).toHaveBeenCalledOnce()
})
