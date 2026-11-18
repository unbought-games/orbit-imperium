import { afterEach, expect, it, vi } from 'vitest'
import { memoryStorage } from '../test-support/bootstrap'
import { clearLegacyOrderStorage } from './legacy-order-storage'
import { browserDependencies, prepareRuntime } from './runtime'
import { bootstrapFixture } from '../test-support/bootstrap'

afterEach(() => vi.unstubAllGlobals())

it('removes old orders, history and recovery markers from both stores without touching preferences', () => {
  const session = memoryStorage(),
    local = memoryStorage()
  for (const storage of [session, local]) {
    for (const key of [
      'orbit:attempts:v2:old',
      'orbit:attempts:v3:old',
      'orbit:attempts:v4:old',
      'orbit:history:v4:old',
      'orbit:session:v2:account',
    ])
      storage.setItem(key, 'old or malformed record')
    storage.setItem('orbit.analytics.disabled', 'true')
    storage.setItem('unrelated', 'keep')
    vi.spyOn(storage, 'setItem')
  }
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('localStorage', local)
  browserDependencies()
  for (const storage of [session, local]) {
    expect(storage.length).toBe(2)
    expect(storage.getItem('orbit.analytics.disabled')).toBe('true')
    expect(storage.getItem('unrelated')).toBe('keep')
    expect(storage.setItem).not.toHaveBeenCalled()
  }
})

it('blocked browser storage permits reading and explains why a recoverable command cannot be sent', async () => {
  const blocked = () => {
    throw Error('Storage blocked')
  }
  expect(() => clearLegacyOrderStorage(blocked)).not.toThrow()
  const storage = memoryStorage()
  storage.setItem('orbit:attempts:v4:old', '{}')
  storage.removeItem = blocked
  storage.setItem = blocked
  vi.stubGlobal('sessionStorage', storage)
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { onLine: true })
  const deps = browserDependencies()
  const submit = vi.fn(async () => {
    throw Error('response lost')
  })
  deps.createPort = () => ({ submit }) as never
  const runtime = await prepareRuntime(bootstrapFixture(), 'document', deps)
  if (runtime.status !== 'authenticated' || runtime.game.status !== 'ready')
    throw Error('runtime unavailable')
  expect(runtime.game.model.ledger.size).toBe(0)
  await runtime.game.model.send({
    type: 'CancelConstruction',
    operation: '00000000-0000-4000-8000-000000000076',
  })
  expect(submit).not.toHaveBeenCalled()
  expect(runtime.game.model.ledger.size).toBe(0)
  expect(runtime.game.model.message).toContain('could not be saved for retry')
})
