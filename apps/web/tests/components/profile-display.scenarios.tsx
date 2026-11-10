import { useLayoutEffect, useState } from 'react'
import type { PlayerDisplay } from '../../src/adapters/player-profiles'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { PlayerName } from '../../src/features/player-name'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'

const profileTime = 1_000_000
const botPlayer = '00000000-0000-4000-8000-000000000032'
const preparedProfiles: PlayerDisplay[] = [
  {
    player: '00000000-0000-4000-8000-000000000031',
    username: 'AzureCommander',
    kind: 'human',
    supporter_tier: 1,
    observed_at: 1000,
    expires_at: 2000,
  },
  {
    player: botPlayer,
    username: 'RoseCommander',
    kind: 'bot',
    supporter_tier: 2,
    observed_at: 1000,
    expires_at: 2000,
  },
  {
    player: '00000000-0000-4000-8000-000000000033',
    username: 'ApricotCommander',
    kind: 'human',
    supporter_tier: 3,
    observed_at: 1000,
    expires_at: 2000,
  },
  {
    player: '00000000-0000-4000-8000-000000000034',
    username: 'RegularCommander',
    kind: 'human',
    observed_at: 1000,
    expires_at: 2000,
  },
]

export type ProfileDisplayControl = {
  publishHuman: () => void
}

declare global {
  interface Window {
    profileDisplayScene?: ProfileDisplayControl
  }
}

function preparedController() {
  const controller = new PlayerProfilesController(async () => {
    throw new Error('Profile display scene must not request profile data')
  })
  controller.store.setState({
    now: profileTime,
    players: Object.fromEntries(
      preparedProfiles.map((profile) => [profile.player, { ...profile }]),
    ),
  })
  return controller
}

/** Only the display boundary: no controller start, timers, HTTP or game session. */
export function ProfileDisplayScenario() {
  const [controller] = useState(preparedController)
  useLayoutEffect(() => {
    const control: ProfileDisplayControl = {
      publishHuman: () => {
        // Publish a prepared authoritative observation into the SAME store.
        // React's production consumers must react without a scene remount.
        controller.store.setState((state) => ({
          players: {
            ...state.players,
            [botPlayer]: {
              ...state.players[botPlayer],
              kind: 'human',
              observed_at: 1001,
            },
          },
        }))
      },
    }
    window.profileDisplayScene = control
    return () => {
      if (window.profileDisplayScene === control)
        delete window.profileDisplayScene
    }
  }, [controller])
  return (
    <PlayerProfilesContext.Provider value={controller}>
      <main style={{ padding: 24 }}>
        <h1>Prepared player identities</h1>
        <ul>
          {preparedProfiles.map((profile) => (
            <li key={profile.player} style={{ marginBlock: 24 }}>
              <PlayerName player={profile.player} />
            </li>
          ))}
        </ul>
      </main>
    </PlayerProfilesContext.Provider>
  )
}
