import { it, expect, vi } from 'vitest'
import {
  prepareRuntime,
  loadInitialRuntime,
  type RuntimeDependencies,
} from './runtime'
import { bootstrapFixture, memoryStorage, id } from '../test-support/bootstrap'
const dependencies = (): RuntimeDependencies => ({
  storage: memoryStorage(),
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
it('storage failures cannot enable actions or discard known authentication', async () => {
  const deps = dependencies()
  deps.storage.setItem = () => {
    throw Error('blocked')
  }
  const r = await prepareRuntime(bootstrapFixture(), 'document', deps)
  expect(r.status).toBe('authenticated')
  if (r.status === 'authenticated')
    expect(r.game).toEqual({
      status: 'unavailable',
      code: 'StorageUnavailable',
    })
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

it('fresh sessions quarantine old intents while same-session reload restores original IDs', async () => {
  const { attemptStorage, prepareSession } = await import('./attempt-storage')
  const deps = dependencies(),
    payload = bootstrapFixture()
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  const session = payload.result.session,
    binding = payload.result.game.snapshot.candidate.binding
  prepareSession(deps.storage, session)
  await attemptStorage(deps.storage).put({
    envelope: {
      protocol: 2,
      binding,
      command_id: id(75),
      command: { type: 'CancelConstruction', operation: id(76) },
    },
    status: 'uncertain',
    receipt: null,
    reconciled: false,
  })
  const restored = await prepareRuntime(payload, 'document', deps)
  if (restored.status !== 'authenticated' || restored.game.status !== 'ready')
    throw Error('runtime')
  expect(
    [...restored.game.model.ledger.values()].map((a) => a.envelope.command_id),
  ).toEqual([id(75)])
  session.csrf = 'new-session'
  const fresh = await prepareRuntime(payload, 'login', deps)
  if (fresh.status !== 'authenticated' || fresh.game.status !== 'ready')
    throw Error('runtime')
  expect(fresh.game.model.ledger.size).toBe(0)
  expect(
    Object.keys(deps.storage).some((k) => k.startsWith('orbit:history:')),
  ).toBe(true)
})
