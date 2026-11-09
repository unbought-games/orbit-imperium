import { useState } from 'react'
import { PlayerName } from '../features/player-name'
import { SupporterIdentity } from '../features/supporter-identity'
import { PlayerProfilesController } from '../client-model/player-profiles'
import { PlayerProfilesContext } from '../shell/player-profiles-context'
import styles from './identity-playground.module.css'
import symbol from '../../../../crates/application/assets/insignias/compass.svg?url'
import triads from '../../../../crates/application/assets/insignias/forge-triads.svg?url'

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const names = [
  'Aurelia',
  'Captain of the Far Northern Stars',
  'CommanderBeyondTheFarthestStarsAndTheUnbrokenHorizon',
  '星の旅人 Étoile',
  'Aurelia',
  'Aurelia',
]
function controller() {
  const c = new PlayerProfilesController(async () => {
    throw new Error('Static typography fixture')
  })
  c.store.setState({
    players: Object.fromEntries(
      names.map((username, n) => [
        id(n + 1),
        {
          player: id(n + 1),
          username,
          kind: n === 4 ? 'bot' : 'human',
          ...(n === 5
            ? {}
            : {
                supporter_tier: 2 as const,
                insignia:
                  n === 1
                    ? {
                        recipe: {
                          version: 1,
                          symbol: 'forge-triads',
                          foreground: '#0f3d2c',
                          background: '#3f9d6b',
                          shape: 'rounded_square' as const,
                          layers: [
                            { symbol: 'forge-triads', color: '#0f3d2c' },
                          ],
                        },
                        asset_url: triads,
                        layers: [
                          {
                            symbol: 'forge-triads',
                            color: '#0f3d2c',
                            asset_url: triads,
                          },
                        ],
                      }
                    : {
                        recipe: {
                          version: 1,
                          symbol: 'compass',
                          foreground: '#cbb68d',
                          background: '#152b40',
                        },
                        asset_url: symbol,
                      },
                alliance: {
                  id: id(20),
                  universe: id(30),
                  name: 'Starward Accord',
                  tag: 'STAR',
                },
              }),
          observed_at: 1,
          expires_at: 4_000_000_000,
        },
      ]),
    ),
  })
  return c
}
export function IdentityPlayground() {
  const [profiles] = useState(controller)
  return (
    <PlayerProfilesContext.Provider value={profiles}>
      <main className={styles.page}>
        <h1>Player identity typography</h1>
        <p>
          Real shared components in short labels, headings, compact rows and
          flowing paragraphs.
        </p>
        <section aria-label="Short text" className={styles.samples}>
          <h2>Short text and titles</h2>
          {[undefined, 1, 2, 3].map((tier) => (
            <p data-baseline key={tier ?? 0}>
              <span data-probe>Consul </span>
              <SupporterIdentity
                name="Aurelia"
                tier={tier as 1 | 2 | 3 | undefined}
              />
              <span data-probe> sends word.</span>
            </p>
          ))}
          <p data-baseline>
            <span data-probe>Consul </span>
            <PlayerName player={id(1)} />
            <span data-probe> sends word.</span>
          </p>
          <p data-baseline>
            <span data-probe>Consul </span>
            <PlayerName player={id(6)} />
            <span data-probe> sends word.</span>
          </p>
        </section>
        <section aria-label="Paragraphs" className={styles.samples}>
          <h2>Paragraphs and long names</h2>
          {names.map((name, n) => (
            <p key={n} data-paragraph>
              <span>Fleet command received a message from </span>
              <PlayerName player={id(n + 1)} />
              <span> about the ships arriving tomorrow. We asked </span>
              <PlayerName
                player={id(n + 1)}
                interactive={false}
                linkAlliance={false}
              />
              <span>
                {' '}
                to coordinate the return flight with the rest of the alliance.
                Every line should keep the same rhythm, even when a name wraps
                onto the next line.
              </span>
            </p>
          ))}
        </section>
        <section aria-label="Headings and rows" className={styles.samples}>
          <h2>Headings and narrow rows</h2>
          <h3 data-heading>
            Consul <SupporterIdentity name="Aurelia" tier={2} />
          </h3>
          <h3 data-heading>
            Commander <PlayerName player={id(2)} />
          </h3>
          <div className={styles.rows}>
            {names.map((_, n) => (
              <div key={n}>
                <span>#{n + 1}</span>
                <span>
                  <PlayerName player={id(n + 1)} />
                </span>
                <span>1,234</span>
              </div>
            ))}
          </div>
          <p className={styles.small} data-paragraph>
            Recorded by <PlayerName player={id(3)} /> after the final fleet
            returned. A compact report still needs readable, evenly spaced
            lines.
          </p>
          <p className={styles.large} data-paragraph>
            Welcome, <SupporterIdentity name={names[1]} tier={3} />. Your empire
            awaits.
          </p>
          <p>
            Supporter badge with a keyboard explanation:{' '}
            <SupporterIdentity name="Aurelia" tier={2} badgeTooltip />.
          </p>
        </section>
      </main>
    </PlayerProfilesContext.Provider>
  )
}
