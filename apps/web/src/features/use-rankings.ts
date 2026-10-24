import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import {
  RankingsController,
  aroundPlayer,
  rankingWindow,
} from '../client-model/rankings'

export function useRankings(model: Coordinator, player: string) {
  const [controller] = useState(
    () => new RankingsController(() => model.rankings()),
  )
  const state = useStore(controller.store)
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, select] = useState<string | null>(null)
  useEffect(() => {
    void controller.refresh()
    return () => controller.cancel()
  }, [controller])
  const players = state.data?.players ?? []
  return {
    ...state,
    search,
    window: rankingWindow(players, search, offset),
    me: players.find((p) => p.player === player),
    selected: players.find((p) => p.player === selected),
    select,
    browse: setOffset,
    filter: (term: string) => {
      setSearch(term)
      setOffset(0)
    },
    top: () => {
      setSearch('')
      setOffset(0)
    },
    aroundMe: () => {
      setSearch('')
      setOffset(aroundPlayer(players, player))
    },
    refresh: () => {
      void controller.refresh()
    },
  }
}
