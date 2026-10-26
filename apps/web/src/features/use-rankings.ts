import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import {
  RankingsController,
  aroundPlayer,
  rankingWindow,
  allianceRankingWindow,
  aroundAlliance,
  type RankingScope,
} from '../client-model/rankings'

export function useRankings(model: Coordinator, player: string) {
  const [controller] = useState(
    () => new RankingsController(() => model.rankings()),
  )
  const state = useStore(controller.store)
  const [scope, setScope] = useState<RankingScope>('players')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [selected, select] = useState<string | null>(null)
  useEffect(() => {
    void controller.refresh()
    return () => controller.cancel()
  }, [controller])
  const players = state.data?.players ?? []
  const alliances = state.data?.alliances ?? []
  const me = players.find((p) => p.player === player)
  const myAlliance = alliances.find((a) => a.alliance.id === me?.alliance?.id)
  return {
    ...state,
    scope,
    switchScope: (next: RankingScope) => {
      setScope(next)
      setSearch('')
      setOffset(0)
      select(null)
    },
    allianceWindow: allianceRankingWindow(alliances, search, offset),
    myAlliance,
    ownRow: scope === 'players' ? me : myAlliance,
    baselineAt:
      scope === 'players'
        ? state.data?.baseline_at
        : state.data?.alliance_baseline_at,
    total: scope === 'players' ? players.length : alliances.length,
    search,
    window: rankingWindow(players, search, offset),
    me,
    selectedId: selected,
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
      setOffset(
        scope === 'players'
          ? aroundPlayer(players, player)
          : aroundAlliance(alliances, myAlliance?.alliance.id ?? ''),
      )
    },
    refresh: () => {
      void controller.refresh()
    },
  }
}
