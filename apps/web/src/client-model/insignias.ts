import { createStore } from 'zustand/vanilla'
import type {
  InsigniaAction,
  InsigniaRecipe,
  InsigniaState,
} from '../adapters/insignias'
import { HttpError } from '../adapters/http'

export const defaultInsignia: InsigniaRecipe = {
  version: 1,
  symbol: 'compass',
  foreground: '#cbb68d',
  background: '#152b40',
}
export function symbolAccess(
  snapshot: InsigniaState,
  symbol: string,
  now: number,
) {
  const item = snapshot.catalog.find((item) => item.id === symbol)
  if (!item) return 'supporter_required'
  if (
    !item.supporter ||
    snapshot.policy === 'unrestricted' ||
    snapshot.library.permanent_symbols.includes(symbol)
  )
    return 'available'
  return snapshot.expires_at * 1000 > now ? item.access : 'unavailable'
}
export function insigniaMessage(error: unknown) {
  if (error instanceof HttpError) {
    if (error.status === 403)
      return 'This symbol requires supporter access or a permanent unlock.'
    if (error.status === 409)
      return 'The design changed elsewhere, or your library is full. Reload the library, then discard changes to use the latest design or delete an unused design.'
    if (error.status === 400)
      return 'Use a name of 1–40 characters and valid colors.'
  }
  return 'We could not confirm the change. Reload the library before retrying; your saved designs are preserved.'
}
type State = {
  snapshot?: InsigniaState
  now: number
  busy: boolean
  error: string
  message: string
}
/** Session-owned observations. Only explicit user drafts live outside this store. */
export class InsigniaController {
  readonly store = createStore<State>(() => ({
    now: Date.now(),
    busy: false,
    error: '',
    message: '',
  }))
  private request?: AbortController
  private timer?: ReturnType<typeof setTimeout>
  private active = false
  constructor(
    private api: (
      action: InsigniaAction,
      signal: AbortSignal,
    ) => Promise<InsigniaState>,
    private changed: () => void,
  ) {}
  start() {
    this.active = true
    void this.load()
    const resume = () => {
      this.store.setState({ now: Date.now() })
      if (document.visibilityState === 'visible' && !this.store.getState().busy)
        void this.load()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('pageshow', resume)
    return () => {
      this.active = false
      this.request?.abort()
      this.request = undefined
      this.store.setState({ busy: false })
      clearTimeout(this.timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('pageshow', resume)
    }
  }
  load = () => this.perform({ type: 'Load' })
  perform = async (action: InsigniaAction): Promise<boolean> => {
    if (this.store.getState().busy && action.type !== 'Load') return false
    this.request?.abort()
    const request = new AbortController()
    this.request = request
    clearTimeout(this.timer)
    this.store.setState({
      busy: action.type !== 'Load',
      error: '',
      now: Date.now(),
      ...(action.type !== 'Load' ? { message: '' } : {}),
    })
    try {
      const snapshot = await this.api(action, request.signal)
      if (this.request !== request || !this.active) return false
      this.store.setState({
        snapshot,
        now: Date.now(),
        ...(action.type !== 'Load'
          ? {
              message:
                action.type === 'Delete'
                  ? 'Design deleted.'
                  : action.type === 'Save'
                    ? 'Design saved and equipped.'
                    : 'Empire insignia updated.',
            }
          : {}),
      })
      if (action.type !== 'Load') this.changed()
      return true
    } catch (error) {
      if (this.request === request && this.active)
        this.store.setState({
          error:
            action.type === 'Load'
              ? 'The insignia library is temporarily unavailable. Your saved designs are preserved.'
              : insigniaMessage(error),
          now: Date.now(),
        })
      return false
    } finally {
      if (this.request === request && this.active) {
        this.request = undefined
        this.store.setState({ busy: false, now: Date.now() })
        const expiry = this.store.getState().snapshot?.expires_at ?? 0
        this.timer = setTimeout(
          () => {
            this.store.setState({ now: Date.now() })
            void this.load()
          },
          Math.max(
            1000,
            Math.min(
              30_000,
              expiry * 1000 > Date.now() ? expiry * 1000 - Date.now() : 30_000,
            ),
          ),
        )
      }
    }
  }
}
