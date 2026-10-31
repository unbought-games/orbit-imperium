import { expect, it } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerProfilesController } from '../client-model/player-profiles'
import { PlayerProfilesContext } from '../shell/player-profiles-context'
import { PlayerName } from './player-name'
import {
  HistoricalAlliances,
  sameAlliance,
  type AllianceIdentity,
} from './player-alliance'

const player = '00000000-0000-4000-8000-000000000001'
const alliance: AllianceIdentity = {
  id: '00000000-0000-4000-8000-000000000002',
  universe: '00000000-0000-4000-8000-000000000003',
  tag: 'NEW',
  name: 'New alliance',
}
it('matches alliances by universe and identity, never by their names or tags', () => {
  expect(
    sameAlliance(alliance, { ...alliance, name: 'Renamed', tag: 'REN' }),
  ).toBe(true)
  expect(sameAlliance(alliance, { ...alliance, id: 'other' })).toBe(false)
  expect(sameAlliance(alliance, { ...alliance, universe: 'other' })).toBe(false)
  expect(sameAlliance(undefined, undefined)).toBe(false)
  expect(sameAlliance(alliance, null)).toBe(false)
  expect(sameAlliance(undefined, alliance)).toBe(false)
})
function profiles() {
  const controller = new PlayerProfilesController(async () => {
    throw new Error('No network')
  })
  controller.store.setState({
    now: 1000,
    players: {
      [player]: {
        player,
        username: 'Commander',
        alliance,
        observed_at: 1,
        expires_at: 99999,
      },
    },
  })
  controller.store.getInitialState = controller.store.getState
  return controller
}
it('groups current affiliation into one profile trigger without nested links', () => {
  const html = renderToStaticMarkup(
    h(
      PlayerProfilesContext.Provider,
      { value: profiles() },
      h(PlayerName, { player }),
    ),
  )
  expect(html).toContain('Commander')
  expect(html).toContain('[NEW]')
  expect(html).toContain('aria-label="Commander profile details"')
  expect(html).not.toContain('<a')
})
it('a historical report overrides current affiliation and an old report never guesses it', () => {
  const render = (known: boolean) =>
    renderToStaticMarkup(
      h(
        PlayerProfilesContext.Provider,
        { value: profiles() },
        h(
          HistoricalAlliances.Provider,
          {
            value: known
              ? { [player]: { ...alliance, tag: 'OLD', name: 'Old alliance' } }
              : {},
          },
          h(PlayerName, { player }),
        ),
      ),
    )
  expect(render(true)).toContain('[OLD]')
  expect(render(true)).not.toContain('[NEW]')
  expect(render(false)).not.toContain('/alliances/')
  expect(render(false)).not.toContain('[NEW]')
})
it('an explicit no-alliance observation overrides stale current profiles and button labels avoid nested links', () => {
  const html = renderToStaticMarkup(
    h(
      PlayerProfilesContext.Provider,
      { value: profiles() },
      h(PlayerName, { player, alliance: null }),
    ),
  )
  expect(html).not.toContain('[NEW]')
  const button = renderToStaticMarkup(
    h(
      'button',
      null,
      h(PlayerName, {
        player,
        alliance,
        linkAlliance: false,
        interactive: false,
      }),
    ),
  )
  expect(button).toContain('[NEW]')
  expect(button).not.toContain('<a ')
})
