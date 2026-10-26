import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PlayerKinds, PlayerName } from './player-name'

it('renders an accessible Bot label for a known machine identity', () => {
  const markup = renderToStaticMarkup(
    createElement(
      PlayerKinds.Provider,
      { value: { machine: 'bot' } },
      createElement(PlayerName, { player: 'machine', fallback: 'Harvester' }),
    ),
  )
  expect(markup).toContain('Harvester')
  expect(markup).toContain('aria-label="Bot"')
  expect(markup).toContain('title="Automated player"')
})
it('never infers identity from a player name', () => {
  const markup = renderToStaticMarkup(
    createElement(PlayerName, { player: 'human', fallback: 'Bot McBotface' }),
  )
  expect(markup).not.toContain('aria-label="Bot"')
})

it('uses bot identity from the authenticated public profile source', async () => {
  const { PlayerProfilesController } = await import(
    '../client-model/player-profiles'
  )
  const { PlayerProfilesContext } = await import(
    '../shell/player-profiles-context'
  )
  const profiles = new PlayerProfilesController(async () => {
    throw Error('No network')
  })
  profiles.store.setState({
    now: 0,
    players: {
      machine: {
        player: 'machine',
        username: 'Harvester',
        kind: 'bot',
        observed_at: 0,
        expires_at: 100,
      },
    },
  })
  // React SSR reads the store's initial snapshot; hydrate this fixture explicitly.
  profiles.store.getInitialState = profiles.store.getState
  const markup = renderToStaticMarkup(
    createElement(
      PlayerProfilesContext.Provider,
      { value: profiles },
      createElement(PlayerName, { player: 'machine' }),
    ),
  )
  expect(markup).toContain('Harvester')
  expect(markup).toContain('aria-label="Bot"')
})
