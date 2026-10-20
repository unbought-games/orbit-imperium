import {
  type AttemptStorage,
  type Attempt,
  type Binding,
  bindingKey,
} from '../client-model/commands'
import { validate } from '../client-model/schema'
const prefix = (b: Binding, protocol: 2 | 3 | 4) =>
  `orbit:attempts:v${protocol}:${bindingKey(b)}:`
const matches = (key: string, b: Binding) =>
  key.startsWith(prefix(b, 2)) ||
  key.startsWith(prefix(b, 3)) ||
  key.startsWith(prefix(b, 4))
export function attemptStorage(storage: Storage): AttemptStorage {
  return {
    async load(b) {
      const entries: Attempt[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (!key || !matches(key, b)) continue
        try {
          const a = validate<Attempt>(
            'GameAttempt',
            JSON.parse(storage.getItem(key)!),
          )
          if (key === prefix(b, a.envelope.protocol) + a.envelope.command_id)
            entries.push(a)
        } catch {
          /* Keep corrupt entry quarantined under its original key. */
        }
      }
      return entries
    },
    async put(a) {
      storage.setItem(
        prefix(a.envelope.binding, a.envelope.protocol) + a.envelope.command_id,
        JSON.stringify(a),
      )
    },
    async remove(b, id) {
      storage.removeItem(prefix(b, 2) + id)
      storage.removeItem(prefix(b, 3) + id)
      storage.removeItem(prefix(b, 4) + id)
    },
    async clear(b) {
      for (const key of Object.keys(storage))
        if (matches(key, b)) storage.removeItem(key)
    },
  }
}

/** A new login is a new session; retain prior private history outside recoverable entries. */
export function quarantinePreviousSession(storage: Storage, account: string) {
  for (const key of Object.keys(storage)) {
    if (!/^orbit:attempts:v[234]:/.test(key)) continue
    let a: Attempt
    try {
      a = validate<Attempt>('GameAttempt', JSON.parse(storage.getItem(key)!))
    } catch {
      continue
    }
    if (a.envelope.binding.account !== account) continue
    // Storage failures must propagate: a new session cannot recover these entries.
    storage.setItem(
      key.replace('orbit:attempts:', 'orbit:history:'),
      storage.getItem(key)!,
    )
    storage.removeItem(key)
  }
}
/** A durable session boundary prevents reload from bypassing failed quarantine. */
export function prepareSession(
  storage: Storage,
  session: { account: string; csrf: string },
): boolean {
  const key = `orbit:session:v2:${session.account}`
  const ready = JSON.stringify({ csrf: session.csrf, recovery: 'ready' })
  if (storage.getItem(key) === ready) return true
  storage.setItem(
    key,
    JSON.stringify({ csrf: session.csrf, recovery: 'blocked' }),
  )
  quarantinePreviousSession(storage, session.account)
  storage.setItem(key, ready)
  return false
}
