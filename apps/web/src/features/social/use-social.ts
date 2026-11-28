import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { watchIntelligenceScope } from '../command-hud/intelligence-refresh'
import { SocialController } from '../../client-model/social'
import { watchRecoveredMutations } from '../../client-model/bound-command-recovery'
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
        newId: model.newCommandId,
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
    const stop = watchIntelligenceScope(model.store, refresh)
    const stopRecovery = watchRecoveredMutations(model.store, 'social', refresh)
    const timer = setInterval(refresh, 120_000)
    window.addEventListener('focus', refresh)
    return () => {
      stop()
      stopRecovery()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [controller, model])
  return { controller, state }
}
