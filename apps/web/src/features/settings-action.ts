import { createStore } from 'zustand/vanilla'
import type { Coordinator } from '../client-model/coordinator'
import type { Command } from '../client-model/commands'

export type SettingsActionPort = Pick<Coordinator, 'ready' | 'message' | 'send'>

/** Local submission state. Gameplay and receipt state remain in the coordinator. */
export class SettingsAction {
  readonly store = createStore(() => ({ submitting: false, error: '' }))

  constructor(
    private readonly model: SettingsActionPort,
    private readonly unavailable: string,
  ) {}

  async submit(command: Command, eligible: () => boolean) {
    if (this.store.getState().submitting || !this.model.ready || !eligible())
      return
    this.store.setState({ submitting: true, error: '' })
    try {
      const id = await this.model.send(command)
      if (!id)
        this.store.setState({ error: this.model.message || this.unavailable })
      return id
    } catch {
      this.store.setState({ error: this.unavailable })
    } finally {
      this.store.setState({ submitting: false })
    }
  }
}
