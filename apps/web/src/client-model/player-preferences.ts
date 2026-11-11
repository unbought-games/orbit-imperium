import { createStore } from 'zustand/vanilla'
import type { components } from '../contracts'

export type PlayerPreferences = components['schemas']['PlayerPreferences']
export function validProbeCount(value: string) {
  return value.length > 0 && value[0] !== '0' && !/[^0-9]/.test(value)
}

type State = {
  preferences: PlayerPreferences | null
  busy: boolean
  error: string
  message: string
}
/** One session-owned source for confirmed preferences; form drafts stay local. */
export class PlayerPreferencesController {
  readonly store = createStore<State>(() => ({
    preferences: null,
    busy: false,
    error: '',
    message: '',
  }))
  private request: AbortController | null = null
  constructor(
    private api: (
      preferences: PlayerPreferences | undefined,
      signal: AbortSignal,
    ) => Promise<PlayerPreferences>,
  ) {}

  load = () => this.perform()
  save = (count: string) => {
    if (!validProbeCount(count)) return Promise.resolve(false)
    return this.perform({ galaxy_probe_count: count })
  }
  stop = () => {
    this.request?.abort()
    this.request = null
    this.store.setState({ busy: false })
  }
  private async perform(preferences?: PlayerPreferences) {
    if (this.request) return false
    const request = new AbortController()
    this.request = request
    this.store.setState({ busy: true, error: '', message: '' })
    try {
      const saved = await this.api(preferences, request.signal)
      if (this.request !== request) return false
      this.store.setState({
        preferences: saved,
        message: preferences ? 'Probe count saved.' : '',
      })
      return true
    } catch {
      if (this.request === request)
        this.store.setState({
          error: preferences
            ? 'Could not confirm the saved probe count. Reload the setting before trying again.'
            : 'Could not load your probe count. Try again.',
        })
      return false
    } finally {
      if (this.request === request) {
        this.request = null
        this.store.setState({ busy: false })
      }
    }
  }
}
