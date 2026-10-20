import { it, expect, vi } from 'vitest'
import { RuntimeController } from './runtime-controller'
import { browserDependencies, prepareRuntime } from './runtime'
import { bootstrapFixture, memoryStorage } from '../test-support/bootstrap'
import type { Bootstrap } from '../client-model/bootstrap'
import { HttpError } from './http'

it('does not infer closed signup from a forbidden request', async () => {
  const owner = new RuntimeController(
    { status: 'anonymous', signupEnabled: true },
    browserDependencies(),
    {
      bootstrap: vi.fn(),
      loginBootstrap: vi.fn(),
      signupBootstrap: async () => {
        throw new HttpError(403, 'Forbidden')
      },
      logout: vi.fn(),
    },
  )
  await owner.authenticate(true, 'player', 'password')
  expect(owner.store.getState().runtime.signupEnabled).toBe(true)
  expect(owner.store.getState().message).not.toMatch(/signup is closed/i)
  expect(owner.store.getState().message).toMatch(/blocked/i)
  expect(owner.store.getState().busy).toBe(false)
})
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
it('a delayed retry cannot restore a signed-out session', async () => {
  const deps = browserDependencies()
  Object.defineProperty(deps, 'storage', { value: memoryStorage() })
  const initial = await prepareRuntime(bootstrapFixture(), 'document', deps)
  const pending = deferred<Bootstrap>()
  const api = {
    bootstrap: () => pending.promise,
    loginBootstrap: vi.fn(),
    signupBootstrap: vi.fn(),
    logout: vi.fn(async () => {}),
  }
  const owner = new RuntimeController(initial, deps, api)
  const retry = owner.retry()
  await owner.logout()
  pending.resolve(bootstrapFixture())
  await retry
  expect(owner.store.getState().runtime.status).toBe('anonymous')
  expect(owner.store.getState().busy).toBe(false)
})
it('restoring a cached page immediately suspends old gameplay until authentication is checked', async () => {
  const deps = browserDependencies()
  Object.defineProperty(deps, 'storage', { value: memoryStorage() })
  const initial = await prepareRuntime(bootstrapFixture(), 'document', deps)
  const pending = deferred<Bootstrap>()
  const owner = new RuntimeController(initial, deps, {
    bootstrap: () => pending.promise,
    loginBootstrap: vi.fn(),
    signupBootstrap: vi.fn(),
    logout: vi.fn(),
  })
  const retry = owner.retry(true)
  expect(owner.store.getState().runtime.status).toBe('unavailable')
  if (initial.status === 'authenticated' && initial.game.status === 'ready')
    expect(initial.game.model.ready).toBe(false)
  pending.resolve({
    version: 1,
    signup_enabled: false,
    result: { status: 'anonymous' },
  })
  await retry
  expect(owner.store.getState().runtime.status).toBe('anonymous')
})

it.each([false, true])(
  'preserves explicit sign-in intent across unavailable retries (signup=%s)',
  async (signup) => {
    const deps = browserDependencies()
    Object.defineProperty(deps, 'storage', { value: memoryStorage() })
    const payload = bootstrapFixture(4),
      unavailable = structuredClone(payload)
    if (unavailable.result.status !== 'authenticated') throw Error('fixture')
    unavailable.result.game = { status: 'unavailable', code: 'Unavailable' }
    const api = {
      bootstrap: vi.fn(async () => payload),
      loginBootstrap: vi.fn(async () => unavailable),
      signupBootstrap: vi.fn(async () => unavailable),
      logout: vi.fn(async () => {}),
    }
    const owner = new RuntimeController(
      { status: 'anonymous', signupEnabled: true },
      deps,
      api,
    )
    await owner.authenticate(signup, 'player', 'password')
    api.bootstrap.mockResolvedValueOnce(unavailable).mockResolvedValueOnce({
      version: 1,
      signup_enabled: true,
      result: { status: 'unavailable', code: 'Unavailable' },
    })
    await owner.retry()
    await owner.retry()
    await owner.retry()
    const runtime = owner.store.getState().runtime
    expect(runtime.status).toBe('authenticated')
    if (runtime.status === 'authenticated') {
      expect(runtime.game.status).toBe('ready')
      expect(runtime.source).toBe(signup ? 'signup' : 'login')
    }
    await owner.retry(true)
    const restored = owner.store.getState().runtime
    if (restored.status === 'authenticated')
      expect(restored.source).toBe('retry')
  },
)
it.each([
  'different_session',
  'different_account',
  'logout',
  'anonymous',
] as const)(
  'does not transfer pending login intent after %s',
  async (change) => {
    const deps = browserDependencies()
    Object.defineProperty(deps, 'storage', { value: memoryStorage() })
    const payload = bootstrapFixture(4),
      unavailable = structuredClone(payload)
    if (
      unavailable.result.status !== 'authenticated' ||
      payload.result.status !== 'authenticated'
    )
      throw Error('fixture')
    unavailable.result.game = { status: 'unavailable', code: 'Unavailable' }
    const api = {
      bootstrap: vi.fn(async () => payload),
      loginBootstrap: vi.fn(async () => unavailable),
      signupBootstrap: vi.fn(async () => unavailable),
      logout: vi.fn(async () => {}),
    }
    const owner = new RuntimeController(
      { status: 'anonymous', signupEnabled: true },
      deps,
      api,
    )
    await owner.authenticate(false, 'player', 'password')
    if (change === 'logout') await owner.logout()
    if (change === 'anonymous') {
      api.bootstrap.mockResolvedValueOnce({
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      })
      await owner.retry()
    }
    if (change === 'different_session')
      payload.result.session.csrf = 'other-session'
    if (change === 'different_account')
      payload.result.session.account = '00000000-0000-4000-8000-000000000099'
    await owner.retry()
    const runtime = owner.store.getState().runtime
    if (runtime.status === 'authenticated') expect(runtime.source).toBe('retry')
    else throw Error('lost auth')
  },
)
