import { expect, it } from 'vitest'
import {
  aroundPlayer,
  rankingWindow,
  RankingsController,
  type RankingPlayer,
} from './rankings'
import type { Rankings } from './commands'

const players: RankingPlayer[] = Array.from({ length: 123 }, (_, i) => ({
  player: `player-${i}`,
  username: i === 80 ? 'Étoile Commander' : `Pilot ${i}`,
  rank: i < 2 ? 1 : i + 1,
  points: `${1000 - i}`,
}))
const snapshot = (sampled_at: number): Rankings => ({
  binding: { universe: 'u', account: 'a', player: 'p', epoch: 'e' },
  request_id: 'r',
  sampled_at,
  processing_pending: false,
  players,
})

it('searches names case-insensitively without changing global ranks or the snapshot', () => {
  expect(rankingWindow(players, '  ÉTOILE  ', 0).rows).toEqual([players[80]])
  expect(rankingWindow(players, 'E\u0301toile', 0).rows[0].rank).toBe(81)
  expect(rankingWindow(players, 'unknown', 0)).toEqual({
    rows: [],
    start: 0,
    count: 0,
  })
  expect(
    rankingWindow(players, '', 0)
      .rows.slice(0, 2)
      .map((p) => p.rank),
  ).toEqual([1, 1])
})

it('pages every row once and centers the actual player even with tied ranks', () => {
  const rows = [0, 50, 100].flatMap(
    (offset) => rankingWindow(players, '', offset).rows,
  )
  expect(rows).toEqual(players)
  expect(aroundPlayer(players, 'player-80')).toBe(55)
  expect(aroundPlayer(players, 'player-122')).toBe(73)
  expect(aroundPlayer(players, 'player-0')).toBe(0)
  expect(aroundPlayer([], 'missing')).toBe(0)
  expect(aroundPlayer(players.slice(0, 3), 'player-2')).toBe(0)
  const tied = players.map((p) => ({ ...p, rank: 1 }))
  expect(aroundPlayer(tied, 'player-80')).toBe(55)
})

it('retains the previous snapshot on refresh failure and accepts only the latest request', async () => {
  const pending: ((value: Rankings | null) => void)[] = []
  const controller = new RankingsController(
    () => new Promise((resolve) => pending.push(resolve)),
  )
  const first = controller.refresh()
  pending[0](snapshot(1000))
  await first
  const failed = controller.refresh()
  pending[1](null)
  await failed
  expect(controller.store.getState().data?.sampled_at).toBe(1000)
  expect(controller.store.getState().error).toMatch(/could not/)
  const older = controller.refresh(),
    newer = controller.refresh()
  pending[3](snapshot(3000))
  await newer
  pending[2](snapshot(2000))
  await older
  expect(controller.store.getState().data?.sampled_at).toBe(3000)
  expect(controller.store.getState().loading).toBe(false)
  const abandoned = controller.refresh()
  controller.cancel()
  pending[4](snapshot(4000))
  await abandoned
  expect(controller.store.getState().data?.sampled_at).toBe(3000)
})
