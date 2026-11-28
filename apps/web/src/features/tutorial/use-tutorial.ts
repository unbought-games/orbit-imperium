import { useStore } from 'zustand'
import { useGameSession } from '../../shell/session-context'
import { tutorialPending } from './model'

export function useTutorial() {
  const { model } = useGameSession()
  const read = useStore(model.store, (s) => s.tutorial)
  const pending = useStore(model.store, tutorialPending)
  return {
    model,
    ...read,
    pending,
    retry: () => void model.tutorial.ensure(true),
    setBeginner: (beginner: boolean) =>
      model.send({
        type: 'World',
        action: { type: 'SetTutorialPresentation', beginner },
      }),
    open: () => model.send({ type: 'World', action: { type: 'OpenTutorial' } }),
  }
}
