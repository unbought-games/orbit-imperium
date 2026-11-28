import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { orbReportAge, orbReportGlance } from './report-glance'

type S = components['schemas']
type Preview = S['ReportPreview4']
const home = { galaxy: 1, system: 26, position: 12 }
const away = { galaxy: 1, system: 23, position: 7 }
const cargo = { metal: '12000000000', crystal: '4800000000', deuterium: '0' }
const glance = (preview: Preview, viewer?: string) =>
  orbReportGlance({ kind: preview.kind, preview }, viewer)

it.each([
  [-1, 'now', 'Just now'],
  [59_999, 'now', 'Just now'],
  [60_000, '1m', '1 minute ago'],
  [3_599_999, '59m', '59 minutes ago'],
  [3_600_000, '1h', '1 hour ago'],
  [3 * 3_600_000, '3h', '3 hours ago'],
  [2 * 86_400_000, '2d', '2 days ago'],
  [7 * 86_400_000, '1w', '1 week ago'],
  [15 * 86_400_000, '2w', '2 weeks ago'],
] as const)(
  'floors elapsed time %d to one compact unit with a spoken label',
  (elapsed, short, full) => {
    expect(orbReportAge(1_000_000, 1_000_000 + elapsed)).toEqual({
      short,
      full,
    })
  },
)

it('keeps spy identity tied to the recorded sender and distinguishes the origin from the target', () => {
  expect(
    glance({
      kind: 'SpyContact',
      sender: 'spy',
      detected: true,
      origin: away,
      target: home,
      target_kind: 'Moon',
    }),
  ).toMatchObject({
    title: 'Probed from [1:23:7]',
    location: 'your moon [1:26:12]',
    tone: 'spy',
    player: 'spy',
  })
  const legacy = glance({ kind: 'SpyContact', target: home })
  expect(legacy.title).toBe('Espionage contact')
  expect(legacy.player).toBeUndefined()
})

it('puts the observed body in the scouting headline and only exposes its recorded owner', () => {
  expect(
    glance({
      kind: 'Espionage',
      target: {
        name: 'Nova Roma',
        kind: 'Planet',
        coordinates: away,
        owner: 'target owner',
        body: 'body',
      },
    }),
  ).toMatchObject({
    title: 'Scouted Nova Roma',
    location: '[1:23:7]',
    tone: 'spy',
    player: 'target owner',
  })
  expect(glance({ kind: 'Espionage' })).toMatchObject({
    title: 'Espionage scan',
    location: '',
  })
})

const participants = [
  { owner: 'a', side: 'Attacker' },
  { owner: 'd', side: 'Defender' },
] as const
it.each([
  ['a', 'AttackerVictory', 'Attack on Nova Roma · Victory', 'win'],
  ['a', 'DefenderVictory', 'Attack on Nova Roma · Defeat', 'loss'],
  ['a', 'Draw', 'Attack on Nova Roma · Draw', 'neutral'],
  ['d', 'AttackerVictory', 'Defense of Nova Roma · Defeat', 'loss'],
  ['d', 'DefenderVictory', 'Defense of Nova Roma · Victory', 'win'],
  ['d', 'Draw', 'Defense of Nova Roma · Draw', 'neutral'],
  [
    'd',
    'MutualDestruction',
    'Defense of Nova Roma · Mutual destruction',
    'loss',
  ],
  [
    'other',
    'AttackerVictory',
    'Battle at Nova Roma · Attacker victory',
    'neutral',
  ],
] as const)(
  '%s sees their role and result for %s',
  (viewer, outcome, title, tone) => {
    expect(
      glance(
        {
          kind: 'Combat',
          target_name: 'Nova Roma',
          target: away,
          participants: [...participants],
          outcome,
        },
        viewer,
      ),
    ).toMatchObject({ title, location: '[1:23:7]', tone })
  },
)
it('uses the recorded winner for a viewer on both sides and coordinates when a historical name is missing', () => {
  expect(
    glance(
      {
        kind: 'Combat',
        participants: participants.map((p) => ({ ...p, owner: 'both' })),
        target: away,
        outcome: 'DefenderVictory',
      },
      'both',
    ),
  ).toMatchObject({
    title: 'Battle at [1:23:7] · Defender victory',
    location: '',
    tone: 'neutral',
  })
})

it('shows only the recipient loss and its recorded location for contact lost', () => {
  const result = glance({
    kind: 'ContactLost',
    target: away,
    own_lost_ships: [{ ship_type: 'EspionageProbe', count: '2' }],
  })
  expect(result).toMatchObject({
    title: 'Fleet contact lost',
    location: '2 probes lost at [1:23:7]',
    tone: 'loss',
  })
  expect(result.player).toBeUndefined()
})

it.each([
  [
    {
      kind: 'Returned',
      origin_coordinates: home,
      destination_coordinates: away,
    },
    'Fleet returned',
    'Home [1:26:12] · Mission target [1:23:7]',
  ],
  [
    { kind: 'Returned', destination_coordinates: away },
    'Fleet returned',
    'Mission target [1:23:7]',
  ],
  [
    { kind: 'Recalled', origin_coordinates: home, origin_kind: 'Moon' },
    'Fleet recalled',
    'Homeward to moon [1:26:12]',
  ],
  [
    { kind: 'Deployed', destination_coordinates: away },
    'Fleet deployed',
    'To [1:23:7]',
  ],
  [
    { kind: 'MissionFailed', destination_coordinates: away },
    'Mission failed',
    'Target [1:23:7]',
  ],
  [
    { kind: 'Delivered', origin: home, target: away, target_name: 'Meridian' },
    'Cargo delivered',
    'To Meridian [1:23:7]',
  ],
  [
    { kind: 'Colonized', destination_coordinates: away },
    'Colony founded',
    '[1:23:7]',
  ],
  [
    {
      kind: 'ColonizationFailed',
      destination_coordinates: away,
      reason: 'Occupied',
    },
    'Colony failed · Position occupied',
    '[1:23:7]',
  ],
  [
    { kind: 'PlanetAbandoned', release_at: 984576, coordinates: away },
    'Planet abandoned',
    '[1:23:7]',
  ],
  [
    { kind: 'MoonDestroyed', coordinates: away, diameter_km: 8000 },
    'Moon destroyed',
    '[1:23:7] · 8,000 km diameter',
  ],
  [
    {
      kind: 'MoonFleetRedirected',
      mission: 'Transport',
      coordinates: away,
      due_at: 42,
    },
    'Fleet redirected to parent',
    'Transport · [1:23:7]',
  ],
  [
    {
      kind: 'MoonTargetLost',
      mission: 'DestroyMoon',
      coordinates: away,
      due_at: 42,
    },
    'Fleet target lost',
    'Destroy Moon · moon [1:23:7]',
  ],
  [
    { kind: 'MoonCreated', coordinates: away, diameter_km: 8144 },
    'Moon formed',
    '[1:23:7] · 8,144 km diameter',
  ],
  [
    { kind: 'SiteEncounter', outcome: 'MutualDestruction', coordinates: away },
    'Mutual destruction at NPC site',
    'Personal site [1:23:7]',
  ],
  [
    {
      kind: 'Phalanx',
      source: { kind: 'Moon', coordinates: home, body: 'm' },
      target: { kind: 'Planet', coordinates: away, body: 'p' },
      cost: '5000000000',
      at: 17,
    },
    'Phalanx scan completed',
    'Planet [1:23:7]',
  ],
] satisfies Array<[Preview, string, string]>)(
  'describes the historical endpoint for %o',
  (preview, title, location) => {
    expect(glance(preview)).toMatchObject({ title, location })
  },
)

it('separates newly collected debris, an empty collection, and unavailable historical yields', () => {
  const base = {
    kind: 'Harvested' as const,
    destination_coordinates: away,
    cargo,
  }
  const legacy = glance(base)
  expect(legacy).toMatchObject({
    title: 'Harvest complete',
    location: 'Debris field [1:23:7]',
  })
  expect(legacy.harvested).toBeUndefined()
  const empty = glance({
    ...base,
    harvested: { metal: '0', crystal: '0', deuterium: '0' },
  })
  expect(empty.title).toBe('No debris collected')
  expect(empty.harvested).toBeUndefined()
  expect(glance({ ...base, harvested: cargo })).toMatchObject({
    title: 'Harvested',
    harvested: cargo,
  })
})

it.each([
  [
    { kind: 'MissileImpact', outcome: 'NoTarget' },
    'Missile target unavailable',
  ],
  [
    { kind: 'MissileImpact', outcome: 'Impacted', penetrating: '1' },
    '1 missile penetrated',
  ],
  [
    { kind: 'MissileImpact', outcome: 'Impacted', penetrating: '3' },
    '3 missiles penetrated',
  ],
  [
    {
      kind: 'MissileImpact',
      outcome: 'Impacted',
      sent: '3',
      intercepted: '3',
      penetrating: '0',
    },
    'All missiles intercepted',
  ],
  [
    { kind: 'MissileImpact', outcome: 'Impacted', penetrating: '0' },
    'Missile impact',
  ],
] satisfies Array<[Preview, string]>)(
  'only claims missile outcomes established by the observation %o',
  (preview, title) => {
    expect(glance(preview).title).toBe(title)
  },
)

it('preserves historical header-only report titles and omits unknown locations', () => {
  for (const [kind, title] of [
    ['Espionage', 'Espionage report'],
    ['SpyContact', 'Spy Contact report'],
    ['SiteEncounter', 'NPC encounter report'],
  ])
    expect(orbReportGlance({ kind })).toMatchObject({ title, location: '' })
})

it.each([
  [true, true, 'Moon destroyed · Attacking fleet lost'],
  [true, false, 'Moon destroyed · Attacking fleet escaped'],
  [false, true, 'Moon survived · Attacking fleet lost'],
  [false, false, 'Moon survived · Attacking fleet escaped'],
] as const)(
  'preserves both destruction outcomes after a victorious battle',
  (moon_destroyed, fleet_lost, title) => {
    const preview: Preview = {
      kind: 'Combat',
      target: away,
      target_name: 'Selene',
      target_kind: 'Moon',
      outcome: 'AttackerVictory',
      moon_destruction: {
        diameter_km: 8000,
        surviving_dreadnoughts: '10',
        moon_chance_ppm: 333850,
        fleet_loss_ppm: 447213,
        moon_destroyed,
        fleet_lost,
      },
    }
    expect(glance(preview)).toMatchObject({
      title,
      location: 'Selene (Moon) [1:23:7]',
      tone: 'neutral',
    })
  },
)
