import { readFileSync } from 'node:fs'
import { body } from '../test-support/empire'
import { tutorialFixture } from '../test-support/tutorial'
import { productionFixture } from '../test-support/production'
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
it('hydrates completed guidance from the bound document before the shell requests it', async () => {
  const deps = dependencies()
  const payload = bootstrapFixture(4)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  const snapshot = payload.result.game.snapshot
  snapshot.tutorial = tutorialFixture(true)
  payload.result.session.memberships.unshift({
    universe: id(93),
    player: id(94),
    universe_name: 'Other',
  })
  deps.readEmbedded = () => payload
  const world = vi.fn()
  const port = { ...deps.createPort('csrf', snapshot.candidate), world }
  deps.createPort = () => port
  const pendingScreen = vi.fn()
  const runtime = await loadInitialRuntime(deps, false, pendingScreen)
  if (runtime.status !== 'authenticated' || runtime.game.status !== 'ready')
    throw Error('runtime')
  const { model } = runtime.game
  expect(model.store.getState().tutorial.data).toEqual(snapshot.tutorial)
  await model.tutorial.ensure()
  expect(world).not.toHaveBeenCalled()
  expect(deps.fetchBootstrap).not.toHaveBeenCalled()
  expect(pendingScreen).not.toHaveBeenCalled()
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

it('prepares protocol 3 bootstrap with all published building level keys on the funded planet', async () => {
  const payload = bootstrapFixture(3)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready' ||
    payload.result.game.snapshot.view.protocol !== 3
  )
    throw Error('Expected a ready protocol 3 snapshot')
  const view = payload.result.game.snapshot.view
  const keys: string[] = JSON.parse(
    readFileSync('contracts/openapi.json', 'utf8'),
  ).components.schemas.BuildingId3.enum
  const planet = {
    ...body,
    levels: { ...body.levels, ...Object.fromEntries(keys.map((k) => [k, 0])) },
  }
  view.bodies = [planet]
  view.progression.production = [productionFixture(planet)]
  const runtime = await prepareRuntime(payload, 'document', dependencies())
  expect(runtime.status).toBe('authenticated')
  if (runtime.status !== 'authenticated' || runtime.game.status !== 'ready')
    throw Error('Expanded building levels prevented startup')
  expect(runtime.game.model.view?.bodies[0].levels).toMatchObject({
    Terraformer: 0,
    NaniteFactory: 0,
    ResearchLab: 0,
  })
})
