import { colonizationStatus } from '../client-model/colonization'
import { useState } from 'react'
import { Check, ArrowUpRight } from 'lucide-react'
import { BrandLogo, BrandWordmark } from '../ui/brand'
import { Button } from '../ui/button'
import { Field, Input } from '../ui/form'
import { Heading, Eyebrow, Text } from '../ui/typography'
import { GalaxyPosition } from './galaxy-position'
import {
  SupporterIdentity,
  supporterTiers,
  tierLabels,
  type SupporterTier,
  type SupporterPalette,
  type SupporterBadge,
} from './supporter-identity'
import type { components } from '../contracts'
import styles from './supporter-preview.module.css'
import galaxyStyles from './galaxy.module.css'

const players = ['Polaris', 'Cassiopeia', 'Solaris', 'Wayfarer']
const positions: components['schemas']['GalaxyPosition4'][] = players.map(
  (_, i) => ({
    coordinates: { galaxy: 1, system: 42, position: i + 4 },
    body: {
      id: `preview-${i}`,
      kind: 'Planet',
      owner: `preview-player-${i}`,
      activity: { type: 'None' },
      inactivity: 'Active',
      vacation: false,
      espionage_eligible: true,
    },
    debris:
      i === 1
        ? {
            field_identity: 'preview-debris',
            metal: '450000000',
            crystal: '120000000',
          }
        : null,
  }),
)

export function SupporterPreview() {
  const [palette, setPalette] = useState<SupporterPalette>('starlight')
  const [badge, setBadge] = useState<SupporterBadge>('star')
  const [tier, setTier] = useState<SupporterTier>(2)
  const [name, setName] = useState('StellarNomad')
  const [action, setAction] = useState('')
  const identity = { palette, badge }
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.brand}>
          <BrandLogo alt="" />
          <BrandWordmark />
        </div>
        <span className={styles.previewLabel}>Supporter preview · UI only</span>
      </header>
      <main id="main" className={styles.main}>
        <header className={styles.intro}>
          <Eyebrow>A little recognition. Across the universe.</Eyebrow>
          <Heading level={1} className={styles.title}>
            A name that shines.
          </Heading>
          <Text>One community. Three ways to support it.</Text>
        </header>
        <div className={styles.workspace}>
          <aside className={styles.controls} aria-label="Preview controls">
            <Heading level={2}>Find the right feel</Heading>
            <fieldset>
              <legend>01 / Name colors</legend>
              <Button
                variant="secondary"
                className={styles.choice}
                aria-pressed={palette === 'aurora'}
                onClick={() => setPalette('aurora')}
              >
                <span>
                  <strong>Aurora</strong>
                  <small>Jade · Lilac · Gold</small>
                </span>
                <span className={styles.swatches} aria-hidden="true">
                  <i style={{ background: '#8cdec1' }} />
                  <i style={{ background: '#c4adff' }} />
                  <i style={{ background: '#f0cb7a' }} />
                </span>
              </Button>
              <Button
                variant="secondary"
                className={styles.choice}
                aria-pressed={palette === 'starlight'}
                onClick={() => setPalette('starlight')}
              >
                <span>
                  <strong>Starlight</strong>
                  <small>Ice · Rose · Apricot</small>
                </span>
                <span className={styles.swatches} aria-hidden="true">
                  <i style={{ background: '#85d6ef' }} />
                  <i style={{ background: '#f0acd4' }} />
                  <i style={{ background: '#f2bb83' }} />
                </span>
              </Button>
            </fieldset>
            <fieldset>
              <legend>02 / Badge style</legend>
              <Button
                variant="secondary"
                className={styles.choice}
                aria-pressed={badge === 'orbital'}
                onClick={() => setBadge('orbital')}
              >
                <span>
                  <strong>Celestial</strong>
                  <small>Orbit → Diamond → Sparkles</small>
                </span>
                {badge === 'orbital' && <Check size={16} aria-hidden="true" />}
              </Button>
              <Button
                variant="secondary"
                className={styles.choice}
                aria-pressed={badge === 'star'}
                onClick={() => setBadge('star')}
              >
                <span>
                  <strong>Signature star</strong>
                  <small>One symbol, three colors</small>
                </span>
                {badge === 'star' && <Check size={16} aria-hidden="true" />}
              </Button>
            </fieldset>
            <Field>
              03 / Try your name
              <Input
                value={name}
                maxLength={48}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <p className={styles.note}>
              Sample identities. Changes stay in this preview.
            </p>
          </aside>
          <div className={styles.examples}>
            <section aria-label="Supporter tiers" className={styles.tiers}>
              {supporterTiers.map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  className={styles.tier}
                  aria-pressed={tier === value}
                  aria-label={`Preview ${tierLabels[value]}`}
                  onClick={() => setTier(value)}
                >
                  <span className={styles.tierLabel}>
                    {tierLabels[value]}{' '}
                    {tier === value && <Check size={13} aria-hidden="true" />}
                  </span>
                  <SupporterIdentity
                    {...identity}
                    name={name || 'StellarNomad'}
                    tier={value}
                  />
                </Button>
              ))}
            </section>
            <section className={styles.account} aria-label="Account preview">
              <div className={styles.avatar} aria-hidden="true">
                {(name || 'S').slice(0, 1).toUpperCase()}
              </div>
              <div className={styles.accountName}>
                <span className={styles.label}>Your account</span>
                <SupporterIdentity
                  {...identity}
                  name={name || 'StellarNomad'}
                  tier={tier}
                />
                <small>
                  Supporter · Thank you for supporting unbought games.
                </small>
              </div>
              <ArrowUpRight size={20} aria-hidden="true" />
            </section>
            <section className={styles.galaxy} aria-label="Galaxy preview">
              <header className={styles.sectionHeader}>
                <div>
                  <Eyebrow>In the game</Eyebrow>
                  <Heading level={2}>Your corner of the galaxy.</Heading>
                </div>
                <span>1 : 42</span>
              </header>
              <div className={styles.legend}>
                <span>Planet / Commander</span>
                <span>Debris</span>
              </div>
              <div className={galaxyStyles.positionList}>
                {positions.map((position, i) => (
                  <GalaxyPosition
                    key={i}
                    position={position}
                    origin="preview-origin"
                    colony={colonizationStatus(
                      null,
                      position.coordinates.position,
                    )}
                    player={undefined}
                    missions={{
                      attack: true,
                      transport: true,
                      harvest: true,
                      deploy: false,
                    }}
                    playerIdentity={
                      <SupporterIdentity
                        {...identity}
                        name={players[i]}
                        tier={supporterTiers[i]}
                      />
                    }
                    onDraft={(_, mission) =>
                      setAction(
                        `${mission} preview selected. No mission has been sent.`,
                      )
                    }
                  />
                ))}
              </div>
              <p className={styles.note}>
                Monthly contributions in USD. Three supporters and a regular
                player, at actual game size.
              </p>
              {action && (
                <p role="status" className={styles.note}>
                  {action}
                </p>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
