import type { StoreApi } from 'zustand'
import type { components } from '../contracts'
import type { GameState } from './game-store'
import { bindingKey, sameBinding } from './commands'

type S = components['schemas']
export type TutorialData = S['TutorialView4']
export type TutorialRead = {
  data: TutorialData | null
  revision: string | null
  loading: boolean
  error: string | null
}
export const emptyTutorial = (): TutorialRead => ({
  data: null,
  revision: null,
  loading: false,
  error: null,
})

/** One session-owned read source shared by guidance, navigation, fleets and reports. */
export class TutorialEngine {
  private generation = 0
  private key: string | null = null
  private pending: Promise<void> | null = null
  constructor(
    private store: StoreApi<GameState>,
    private read: () => Promise<S['BoundWorld4'] | null>,
  ) {}
  invalidate() {
    this.generation++
    this.key = null
    this.pending = null
    this.store.setState({ tutorial: emptyTutorial() })
  }
  ensure(force = false): Promise<void> {
    const state = this.store.getState()
    const { view, binding } = state
    if (!state.ready || !binding || view?.protocol !== 4)
      return Promise.resolve()
    const key = `${bindingKey(binding)}:${view.viewer_revision}`
    if (!force && this.key === key) return this.pending ?? Promise.resolve()
    this.key = key
    const generation = ++this.generation
    this.store.setState({
      tutorial: { ...state.tutorial, loading: true, error: null },
    })
    const work = (async () => {
      try {
        const result = await this.read()
        const current = this.store.getState()
        if (
          generation !== this.generation ||
          !current.binding ||
          !sameBinding(binding, current.binding)
        )
          return
        if (
          !result ||
          !('enrolled' in result.data) ||
          !sameBinding(result.binding, binding) ||
          BigInt(result.viewer_revision) <
            BigInt(current.view?.viewer_revision ?? '0')
        ) {
          this.store.setState({
            tutorial: {
              ...current.tutorial,
              loading: false,
              error:
                'Guidance is catching up. Refresh to receive current progress.',
            },
          })
          this.key = null
          return
        }
        this.store.setState({
          tutorial: {
            data: result.data,
            revision: result.viewer_revision,
            loading: false,
            error: null,
          },
        })
      } catch {
        if (generation !== this.generation) return
        this.store.setState((s) => ({
          tutorial: {
            ...s.tutorial,
            loading: false,
            error:
              'Unable to load guidance. Your orders and earned rewards are safe. Retry guidance.',
          },
        }))
      }
    })()
    this.pending = work
    return work
  }
}
