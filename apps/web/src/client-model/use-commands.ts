import { useStore } from 'zustand'
import { createGameStore } from './game-store'
import { useEffect, useMemo } from 'react'
import type { AuthenticatedRuntime } from '../adapters/runtime'
import type { Command, QuoteRequest } from './commands'
import { projectGameView, type SubmittedQuote } from './game-projection'
const emptyStore = createGameStore()
export function useCommands(runtime: AuthenticatedRuntime | null) {
  const model = runtime?.game.status === 'ready' ? runtime.game.model : null
  const state = useStore(model?.store ?? emptyStore)
  useEffect(() => {
    if (!model) return
    const timer = setInterval(() => model.tick(), 250)
    return () => clearInterval(timer)
  }, [model])
  useEffect(() => {
    if (!model || !state.ready) return
    const stop = model.startDelivery()
    const wake = () => {
      if (document.visibilityState !== 'hidden') model.resumeDelivery()
    }
    window.addEventListener('online', wake)
    window.addEventListener('focus', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      stop()
      window.removeEventListener('online', wake)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [model, state.ready, state.binding?.epoch])
  useEffect(() => {
    if (model && (runtime?.source === 'login' || runtime?.source === 'signup'))
      void model.recordLogin()
  }, [model, runtime?.source])
  return {
    model,
    view: useMemo(() => projectGameView(state), [state]),
    attempts: [...state.attempts.values()],
    ready: state.ready,
    send: async (command: Command, quote?: SubmittedQuote) => {
      await model?.send(command, quote)
    },
    retry: async (id: string) => {
      await model?.recover(id)
    },
    quote: async (request: QuoteRequest) => {
      const result = await model?.quote(request)
      return result?.protocol === 2 ? result.terms : null
    },
    dismiss: async (id: string) => {
      await model?.dismiss(id)
    },
  }
}
