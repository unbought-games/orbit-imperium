import { expect, it } from 'vitest'
import { quarantinePreviousSession } from './attempt-storage'
import { bindingKey, type Attempt } from '../client-model/commands'
class MemoryStorage implements Storage {
  [key: string]: unknown
  private entries = new Map<string, string>()
  failHistory = false
  get length() {
    return this.entries.size
  }
  key(i: number) {
    return [...this.entries.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.entries.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.failHistory && k.startsWith('orbit:history:')) throw Error('quota')
    this.entries.set(k, v)
    Object.defineProperty(this, k, {
      value: v,
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  removeItem(k: string) {
    this.entries.delete(k)
    delete this[k]
  }
  clear() {
    for (const k of this.entries.keys()) this.removeItem(k)
  }
}
const id = (n: number) =>
  `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
const binding = { account: id(1), player: id(2), universe: id(3), epoch: id(4) }
const attempt: Attempt = {
  envelope: {
    protocol: 2,
    binding,
    command_id: id(5),
    command: { type: 'CancelConstruction', operation: id(6) },
  },
  status: 'uncertain',
  receipt: null,
  reconciled: false,
}
it('quarantine persistence failure blocks a new session instead of silently leaving recoverable intent', () => {
  const storage = new MemoryStorage()
  storage.setItem(
    `orbit:attempts:v2:${bindingKey(binding)}:${id(5)}`,
    JSON.stringify(attempt),
  )
  storage.failHistory = true
  expect(() => quarantinePreviousSession(storage, binding.account)).toThrow(
    'quota',
  )
})
export { MemoryStorage, binding, attempt }
it('a blocked fresh-session boundary remains blocked across immediate reload', async () => {
  const { prepareSession, attemptStorage } = await import('./attempt-storage')
  const storage = new MemoryStorage(),
    old = { account: binding.account, csrf: 'old' },
    fresh = { account: binding.account, csrf: 'fresh' }
  expect(prepareSession(storage, old)).toBe(false)
  await attemptStorage(storage).put(attempt)
  storage.failHistory = true
  expect(() => prepareSession(storage, fresh)).toThrow('quota')
  // The reloaded app consults this same durable boundary before constructing its coordinator.
  expect(() => prepareSession(storage, fresh)).toThrow('quota')
  storage.failHistory = false
  expect(prepareSession(storage, fresh)).toBe(false)
  expect(await attemptStorage(storage).load(binding)).toEqual([])
  expect(prepareSession(storage, fresh)).toBe(true)
})
it('retains protocol-3 original envelopes in separate version keys and quarantines both on new login', async () => {
  const { attemptStorage } = await import('./attempt-storage')
  const raw = new MemoryStorage(),
    s = attemptStorage(raw)
  const v3: Attempt = {
    envelope: {
      protocol: 3,
      binding,
      command_id: id(7),
      command: {
        type: 'SetProduction',
        body: id(8),
        expected_settings_revision: '0',
        settings: {
          metal_mine: 50,
          crystal_mine: 100,
          deuterium_synthesizer: 100,
          solar_plant: 100,
          fusion_reactor: 100,
          solar_satellite: 100,
        },
      },
    },
    status: 'uncertain',
    receipt: null,
    reconciled: false,
  }
  await s.put(attempt)
  await s.put(v3)
  expect(await s.load(binding)).toEqual([attempt, v3])
  expect(raw.getItem(`orbit:attempts:v3:${bindingKey(binding)}:${id(7)}`)).toBe(
    JSON.stringify(v3),
  )
  expect(await s.load({ ...binding, epoch: id(9) })).toEqual([])
  quarantinePreviousSession(raw, binding.account)
  expect(await s.load(binding)).toEqual([])
  expect(raw.getItem(`orbit:history:v3:${bindingKey(binding)}:${id(7)}`)).toBe(
    JSON.stringify(v3),
  )
})
