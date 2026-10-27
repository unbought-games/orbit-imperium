import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { commandId } from '../../adapters/command-id'
import { SocialController } from '../../client-model/social'
import { useGameSession } from '../../shell/session-context'
export function useSocial(player: string | undefined) {
  const { model } = useGameSession()
  const [controller] = useState(
    () =>
      new SocialController({
        read: (q) => model.socialQuery(q),
        command: (q) => model.socialCommand(q),
        readAlliance: async () =>
          (await model.allianceQuery({ type: 'Mine' }))?.alliance ?? null,
        newId: () => commandId(crypto),
      }),
  )
  const state = useStore(controller.store)
  useEffect(() => {
    void controller.loadAlliance()
    return () => controller.clear()
  }, [controller])
  useEffect(() => {
    void controller.open(player ?? null)
  }, [controller, player])
  useEffect(() => {
    const refresh = () => {
      if (
        !document.hidden &&
        !controller.store.getState().busy &&
        !controller.store.getState().pending
      ) {
        void controller.history('newer')
        void controller.pollList()
      }
    }
    const timer = setInterval(refresh, 5000)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [controller])
  return { controller, state }
}
