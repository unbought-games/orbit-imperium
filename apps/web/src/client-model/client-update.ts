import { createStore } from 'zustand/vanilla'

export const reloadQuietPeriodMs = 10 * 60 * 1000
export const reloadNoticeMs = 1500
export const reloadStorageKey = 'orbit:client-reload:v1'
type UpdateState =
  | { status: 'current' }
  | { status: 'refreshing' | 'blocked'; build: string }
  | { status: 'incompatible' }
type Dependencies = {
  build: string
  now(): number
  read(): string | null
  write(value: string): void
  schedule(callback: () => void, delay: number): void
  reload(): void
}

/** One page-wide reload decision, independent of accounts and game state. */
export function createClientUpdate(deps: Dependencies) {
  const store = createStore<UpdateState>(() => ({ status: 'current' }))
  function reserveReload() {
    try {
      const previous = deps.read()
      const now = deps.now()
      if (
        previous !== null &&
        (!Number.isFinite(Number(previous)) ||
          now - Number(previous) < reloadQuietPeriodMs)
      )
        return false
      deps.write(String(now))
      return true
    } catch {
      // Without durable storage we cannot guarantee a reload survives its guard.
      return false
    }
  }
  return {
    store,
    observe(build: string | null): boolean {
      if (!build || build === deps.build) return false
      if (store.getState().status === 'refreshing') return true
      if (!reserveReload()) {
        store.setState({ status: 'blocked', build }, true)
        return true
      }
      store.setState({ status: 'refreshing', build }, true)
      deps.schedule(deps.reload, reloadNoticeMs)
      return true
    },
    incompatible() {
      if (store.getState().status === 'current')
        store.setState({ status: 'incompatible' }, true)
    },
    compatible() {
      if (store.getState().status === 'incompatible')
        store.setState({ status: 'current' }, true)
    },
    reload() {
      // Manual recovery is always available, and also protects the next page.
      try {
        deps.write(String(deps.now()))
      } catch {
        /* A player-requested reload does not require automatic retry storage. */
      }
      deps.reload()
    },
  }
}
