import { createStore } from 'zustand/vanilla'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useStore } from 'zustand'
import {
  CommunityRewardsController,
  type RewardsState,
  rewardsOwner,
  rewardsVisible,
} from '../client-model/community-rewards'
import { communityRewardsApi } from '../adapters/community-rewards'
const RewardsContext = createContext<CommunityRewardsController | null>(null)
export function CommunityRewardsProvider({
  csrf,
  changed,
  children,
}: {
  csrf: string
  changed: () => void
  children: ReactNode
}) {
  const [controller] = useState(
    () => new CommunityRewardsController(communityRewardsApi(csrf), changed),
  )
  useEffect(() => {
    void controller.load()
    return controller.stop
  }, [controller])
  return (
    <RewardsContext.Provider value={controller}>
      {children}
    </RewardsContext.Provider>
  )
}
export function useOptionalCommunityRewards() {
  const controller = useContext(RewardsContext)
  const state = useStore(controller?.store ?? absentRewards)
  return controller
    ? {
        ...state,
        controller,
        owner: rewardsOwner(state.snapshot),
        visible: rewardsVisible(state.snapshot),
      }
    : null
}
export function useCommunityRewards() {
  const rewards = useOptionalCommunityRewards()
  if (!rewards) throw Error('Rewards require an authenticated game session')
  return rewards
}

const absentRewards = createStore<RewardsState>(() => ({
  snapshot: undefined,
  loading: false,
  busy: false,
  error: '',
}))
export function useRewardsVisible() {
  const controller = useContext(RewardsContext)
  return useStore(controller?.store ?? absentRewards, (state) =>
    rewardsVisible(state.snapshot),
  )
}
