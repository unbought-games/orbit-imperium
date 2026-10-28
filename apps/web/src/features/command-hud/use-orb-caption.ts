import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { Coordinator } from '../../client-model/coordinator'
import { incomingThreats } from './model'
import { bindingKey } from '../../client-model/commands'
import { createCaptionEngine } from './caption-engine'
import { captionEvents, initialCaptionEvents } from './caption-events'

const sessions = new WeakMap<
  Coordinator,
  {
    binding: string
    engine: ReturnType<typeof createCaptionEngine>
    initialized: boolean
  }
>()
/** Route changes and mobile remounts retain the session's humor budget. */
export function useOrbCaption(model: Coordinator) {
  const binding = model.binding ? bindingKey(model.binding) : ''
  const session = useMemo(() => {
    let entry = sessions.get(model)
    if (!entry || entry.binding !== binding) {
      entry = { binding, engine: createCaptionEngine(), initialized: false }
      sessions.set(model, entry)
    }
    return entry
  }, [model, binding])
  const caption = useSyncExternalStore(
    session.engine.subscribe,
    session.engine.snapshot,
    () => null,
  )
  useEffect(() => {
    let before = model.store.getState()
    if (!session.initialized) {
      session.initialized = true
      session.engine.handle(initialCaptionEvents(before))
    }
    const stop = model.subscribe((after) => {
      const events = captionEvents(before, after)
      before = after
      if (events.length)
        session.engine.handle(
          events,
          !after.stale && incomingThreats(after).length === 0,
        )
    })
    const hide = () => {
      if (document.hidden) session.engine.suspend()
    }
    document.addEventListener('visibilitychange', hide)
    return () => {
      stop()
      session.engine.suspend()
      document.removeEventListener('visibilitychange', hide)
    }
  }, [model, session])
  return caption
}
