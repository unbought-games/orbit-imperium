import type { components } from '../contracts'
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export function bootstrapFixture(
  protocol: 2 | 3 | 4 = 2,
): components['schemas']['Bootstrap'] {
  const binding = {
      account: id(1),
      player: id(2),
      universe: id(3),
      epoch: id(4),
    },
    request_id = id(5)
  const common = {
    protocol,
    binding,
    request_id,
    profile_hash: 'a'.repeat(64),
    speed: 1,
  }
  const view = {
    ...common,
    viewer_revision: '0',
    sampled_at: 1000,
    as_of_ms: 1000,
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
    ...(protocol > 2
      ? {
          progression: {
            production: [],
            research_operation: null,
            manufacturing: [],
            limits: { max_active_manufacturing_entries: 256 },
          },
        }
      : {}),
    ...(protocol === 4
      ? {
          missions: {
            fleets: [],
            incoming: [],
            score_value_micro: '0',
            fleet_slots: '1',
          },
        }
      : {}),
  }
  return {
    version: 1,
    signup_enabled: true,
    result: {
      status: 'authenticated',
      session: {
        account: id(1),
        csrf: 'csrf',
        expires_at: 9999999999999,
        memberships: [{ universe: id(3), player: id(2) }],
      },
      game: {
        status: 'ready',
        snapshot: {
          request_id,
          candidate: { protocol, binding, request_id, sampled_at: 1000 },
          view: view as components['schemas']['GameView'],
          settings: {
            ...common,
            profile_id:
              protocol === 2
                ? 'shared-foundation-r1'
                : protocol === 3
                  ? 'mvp-v1-slice-2'
                  : 'mvp-v1-slice-4',
            galaxies: 1,
            systems_per_galaxy: 5,
            positions_per_system: 15,
          } as components['schemas']['GameSettings'],
        },
      },
    },
  }
}
export function readyFixture(protocol: 2 | 3 | 4 = 2) {
  const b = bootstrapFixture(protocol)
  if (b.result.status !== 'authenticated' || b.result.game.status !== 'ready')
    throw Error('fixture')
  return { session: b.result.session, snapshot: b.result.game.snapshot }
}
export function memoryStorage(): Storage {
  const data: Record<string, string> = {}
  const storage = {
    get length() {
      return Object.keys(data).length
    },
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
      Object.defineProperty(storage, k, {
        value: v,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    },
    removeItem: (k: string) => {
      delete data[k]
      Reflect.deleteProperty(storage, k)
    },
    clear: () => {
      for (const k of Object.keys(data)) storage.removeItem(k)
    },
    key: (i: number) => Object.keys(data)[i] ?? null,
  }
  return storage
}
