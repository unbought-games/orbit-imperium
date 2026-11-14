import { expect, it } from 'vitest'
import { playerProfileCache } from './player-profile-cache'
import type { PlayerDisplay } from './player-profiles'

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const binding = { account: id(1), player: id(2), universe: id(3), epoch: id(4) }
const player: PlayerDisplay = {
  player: id(2),
  username: 'Aurelia',
  observed_at: 100,
  expires_at: 160,
  insignia: {
    recipe: {
      version: 1,
      symbol: 'compass',
      foreground: '#cbb68d',
      background: '#152b40',
    },
    asset_url: `/api/media/insignias/compass/${'a'.repeat(64)}.svg`,
  },
}
function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

it('rehydrates expired raw snapshots across cache instances and persists emblem removal', () => {
  const disk = storage()
  const first = playerProfileCache(binding, () => disk)
  first.save({ [player.player]: player })
  const reloaded = playerProfileCache(binding, () => disk)
  expect(reloaded.load()).toEqual({ [player.player]: player })
  const removed = { ...player, insignia: undefined }
  reloaded.save({ [player.player]: removed })
  expect(
    playerProfileCache(binding, () => disk).load()[player.player].insignia,
  ).toBeUndefined()
})

it.each(['account', 'player', 'universe', 'epoch'] as const)(
  'isolates cached displays by %s',
  (field) => {
    const disk = storage()
    playerProfileCache(binding, () => disk).save({ [player.player]: player })
    expect(
      playerProfileCache({ ...binding, [field]: id(99) }, () => disk).load(),
    ).toEqual({})
  },
)

it.each(['not json', '{}', '[{"player":"bad"}]'])(
  'ignores corrupt or incompatible storage: %s',
  (raw) => {
    const disk = storage()
    const cache = playerProfileCache(binding, () => disk)
    cache.save({ [player.player]: player })
    disk.values.set([...disk.values.keys()][0], raw)
    expect(cache.load()).toEqual({})
  },
)

it('continues without persistence when storage is unavailable', () => {
  const cache = playerProfileCache(binding, () => {
    throw new Error('Storage denied')
  })
  expect(cache.load()).toEqual({})
  expect(() => cache.save({ [player.player]: player })).not.toThrow()
})
