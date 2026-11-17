import { createStore } from 'zustand/vanilla'
import { commandId } from '../adapters/command-id'
import { HttpError } from '../adapters/http'
import type {
  ShipAppearanceAction,
  ShipAppearanceState,
} from './ship-appearance-types'

export type ShipAppearanceObservation = {
  snapshot: ShipAppearanceState | null
  loading: boolean
  busy: boolean
  error: string
}
export type ShipAppearanceApi = (
  action: ShipAppearanceAction,
  signal: AbortSignal,
  requestId: string,
) => Promise<ShipAppearanceState>

function message(error: unknown, mutation: boolean) {
  if (error instanceof HttpError) {
    if (error.status === 409)
      return 'This design changed elsewhere. Reload before saving your changes.'
    if (error.status === 403)
      return 'One of these choices is no longer available to your empire.'
    if (error.status === 400)
      return 'Check the design name, colors, and emblem placement.'
  }
  return mutation
    ? 'We could not confirm the change. Your draft is preserved; retrying the same change is safe.'
    : 'Ship customization is temporarily unavailable. Your saved designs are preserved.'
}

/** One session's server observations; paint drafts stay in the editor. */
export class ShipAppearancesController {
  readonly store = createStore<ShipAppearanceObservation>(() => ({
    snapshot: null,
    loading: false,
    busy: false,
    error: '',
  }))
  private active = false
  private request?: AbortController
  private timer?: ReturnType<typeof setTimeout>
  private uncertain = new Map<string, string>()
  constructor(
    private api: ShipAppearanceApi,
    private newId = () => commandId(crypto),
  ) {}

  start = () => {
    this.active = true
    void this.reload()
    return this.stop
  }
  stop = () => {
    this.active = false
    this.request?.abort()
    this.request = undefined
    clearTimeout(this.timer)
    this.store.setState({ loading: false, busy: false })
  }
  reload = async (): Promise<void> => {
    await this.perform({ type: 'Load' })
  }

  perform = async (action: ShipAppearanceAction): Promise<boolean> => {
    if (!this.active || this.store.getState().busy) return false
    const mutation = action.type !== 'Load'
    this.request?.abort()
    clearTimeout(this.timer)
    const request = new AbortController()
    this.request = request
    const key = JSON.stringify(action)
    const id = (mutation && this.uncertain.get(key)) || this.newId()
    if (mutation) this.uncertain.set(key, id)
    this.store.setState({ loading: !mutation, busy: mutation, error: '' })
    try {
      const snapshot = await this.api(action, request.signal, id)
      if (!this.active || this.request !== request) return false
      this.store.setState({ snapshot })
      if (mutation) this.uncertain.delete(key)
      return true
    } catch (error) {
      if (this.active && this.request === request)
        this.store.setState({ error: message(error, mutation) })
      return false
    } finally {
      if (this.active && this.request === request) {
        this.request = undefined
        this.store.setState({ loading: false, busy: false })
        const pending = this.store
          .getState()
          .snapshot?.equipment.some(
            (item) =>
              item.render &&
              ['queued', 'rendering', 'preparing'].includes(item.render.stage),
          )
        this.timer = setTimeout(
          () => {
            void this.reload()
          },
          pending ? 1500 : 30_000,
        )
      }
    }
  }
}
