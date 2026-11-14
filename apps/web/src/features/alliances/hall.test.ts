import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PlayerProfilesController } from '../../client-model/player-profiles'
import type { TitleDisplay } from '../../client-model/empire-identity'
import { PlayerProfilesContext } from '../../shell/player-profiles-context'
import { AllianceHall } from './hall'

function render(title?: TitleDisplay) {
  const profiles = new PlayerProfilesController(async () => {
    throw new Error('No network')
  })
  profiles.store.setState({
    players: {
      viewer: {
        player: 'viewer',
        username: 'Pilot',
        observed_at: 1,
        expires_at: 2,
        title,
      },
    },
  })
  profiles.store.getInitialState = profiles.store.getState
  return renderToStaticMarkup(
    h(
      PlayerProfilesContext.Provider,
      { value: profiles },
      h(AllianceHall, {
        player: 'viewer',
        detail: {
          summary: {
            id: 'alliance',
            universe: 'universe',
            name: 'Explorers',
            tag: 'EXP',
            recruitment: 'Open',
            member_count: 1,
          },
          public_text: '',
          revision: 1,
          leader: 'viewer',
          permissions: [],
          grantable_permissions: [],
          posts: [],
        },
        run: async () => true,
        busy: false,
        load: () => {},
      }),
    ),
  )
}

it('addresses the viewer with the title address even after the profile observation expires', () => {
  expect(
    render({
      id: 'sample-curator',
      label: 'Sample curator',
      address: 'Curator',
      expires_at: null,
    }),
  ).toContain('<h3>Welcome home, Curator.</h3>')
})

it.each([
  undefined,
  {
    id: 'sample-curator',
    label: 'Sample curator',
    address: 'Curator',
    expires_at: 1,
  },
])('uses Commander when the effective title is unavailable: %j', (title) => {
  expect(render(title)).toContain('<h3>Welcome home, Commander.</h3>')
})
