import { expect, it } from 'vitest'
import { withoutBodySearch } from './page-search'
it('removes only the legacy planet query without mutating page context', () => {
  const search = {
    body: 'earth',
    player: 'player',
    alliance: 'alliance',
    tab: 'details',
  }
  expect(withoutBodySearch(search)).toEqual({
    player: 'player',
    alliance: 'alliance',
    tab: 'details',
  })
  expect(search.body).toBe('earth')
})
