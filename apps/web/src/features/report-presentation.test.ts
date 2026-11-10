import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReportObservation } from './report-observation'
import { PlayerKinds } from './player-name'

const render = (props: ComponentProps<typeof ReportObservation>) => {
  const markup = renderToStaticMarkup(createElement(ReportObservation, props))
  return { markup, text: markup.replace(/<[^>]+>/g, '') }
}
const cargo = {
  metal: '10713000000',
  crystal: '8238000000',
  deuterium: '2608000000',
}
const location = { galaxy: 1, system: 2, position: 3 }
const attacker = {
  owner: 'attacker',
  origin: { Fleet: 'fleet' },
  side: 'Attacker',
  units: [{ item: { kind: 'Ship', id: 'EspionageProbe' }, count: '6' }],
  technology: [3, 2, 1],
}
const defender = {
  owner: 'defender',
  origin: { Stationed: 'planet' },
  side: 'Defender',
  units: [
    { item: { kind: 'Ship', id: 'LightFighter' }, count: '4' },
    { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '6' },
  ],
  technology: [1, 2, 3],
}
const combat = {
  kind: 'Combat',
  outcome: 'AttackerVictory',
  target: location,
  participants: [attacker, defender],
  survivors: [attacker, { ...defender, units: [] }],
  recovered: [],
  rounds: [],
  loot: cargo,
  own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
}

describe('report facts rendered by the production observation component', () => {
  it('keeps recorded delivery names and coordinates independently of current planets', () => {
    const { text, markup } = render({
      payload: {
        kind: 'Delivered',
        origin: location,
        target: { galaxy: 2, system: 4, position: 8 },
        origin_name: 'Historical home',
        target_name: 'Historical destination',
        cargo,
      },
    })
    expect(text).toContain(
      'Historical home [1:2:3] → Historical destination [2:4:8]',
    )
    expect(text).toContain('Delivered resources10,7138,2382,608')
    expect(markup.match(/data-coordinate=""/g)).toHaveLength(2)
  })

  it.each([
    [
      'collected',
      { metal: '713000000', crystal: '238000000', deuterium: '608000000' },
      '713238608',
      3,
    ],
    ['zero', { metal: '0', crystal: '0', deuterium: '0' }, '00', 2],
  ] as const)(
    'renders %s harvest quantities and canonical resource symbols without carried cargo',
    (_, harvested, amounts, count) => {
      const { text, markup } = render({
        payload: { kind: 'Harvested', harvested, cargo },
      })
      expect(text).toContain(`Harvested resources${amounts}`)
      expect(text).not.toMatch(
        /Carried resources|unavailable|10,713|8,238|2,608/,
      )
      expect(markup.match(/<svg[^>]+data-resource=/g)).toHaveLength(count)
      for (const resource of count === 3
        ? ['metal', 'crystal', 'deuterium']
        : ['metal', 'crystal']) {
        expect(markup).toContain(`data-resource="${resource}"`)
        expect(markup).toContain(`color:var(--resource-${resource})`)
        expect(markup).toContain(
          `aria-label="${resource[0].toUpperCase()}${resource.slice(1)}"`,
        )
      }
      if (count === 2) expect(markup).not.toContain('data-resource="deuterium"')
    },
  )

  it.each([
    ['Occupied', 'The position was occupied at arrival.'],
    ['PositionLocked', 'The position was not unlocked at arrival.'],
    ['ColonyCapacity', 'Your planet limit was full at arrival.'],
    ['FutureReason', 'Arrival could not establish a colony.'],
  ])(
    'explains %s colonization failure and conserved ships/cargo',
    (reason, message) => {
      const { text } = render({
        payload: {
          kind: 'ColonizationFailed',
          reason,
          destination_coordinates: location,
          return_at: 120000,
        },
      })
      expect(text).toContain('Colonization failedDestination [1:2:3]')
      expect(text).toContain(
        `${message} All ships and cargo return; fuel is not refunded.`,
      )
      expect(text).toContain('Return arrival:')
      expect(text).not.toContain('No ships remain')
    },
  )

  it('renders founding resources, colony facts and released slot without inventing a return', () => {
    const { text } = render({
      payload: {
        kind: 'Colonized',
        destination_coordinates: location,
        fields: 230,
        diameter_km: 15191,
        min_temperature: 24,
        max_temperature: 64,
        resources: {
          metal: '1500000000',
          crystal: '500000000',
          deuterium: '0',
        },
        return_at: null,
      },
    })
    expect(text).toContain(
      'Consumed one Colony Ship. 230 fields · 15191 km diameter · 24 to 64 °C.',
    )
    expect(text).toContain('Resources at founding1,5005000')
    expect(text).toContain(
      'No ships remain to return; the fleet slot is released.',
    )
    expect(text).not.toContain('Return arrival:')
  })

  it('renders defeat relative to the defender and separates ships from defenses', () => {
    const { text, markup } = render({ payload: combat, viewer: 'defender' })
    expect(text).toContain('✕ Defeat')
    expect(text).toContain('You were the defender')
    expect(text).not.toMatch(/Loot|Your cargo lost/)
    expect(markup).toMatch(/scope="rowgroup"[^>]*>Ships/)
    expect(markup).toMatch(/scope="rowgroup"[^>]*>Defenses/)
    expect(text).toContain('Light Fighter')
    expect(text).toContain('Rocket Launcher')
  })

  it('renders legacy combined fire without inventing participant damage or attacker locations', () => {
    const { text, markup } = render({
      payload: {
        ...combat,
        rounds: [
          {
            number: 1,
            start: combat.participants,
            end: combat.survivors,
            shots: '24',
            raw_attack_ticks: '124000000',
            shield_removed_ticks: '18000000',
            hull_removed_ticks: '76000000',
            explosions: '3',
          },
        ],
      },
      viewer: 'attacker',
    })
    expect(text).toContain('Origin · Not recorded')
    expect(text).toContain('Location · [1:2:3]')
    expect(text).toContain('Per-player damage is unavailable.')
    expect(text).toContain(
      'Shots fired24Attack power1,240Shield damage dealt180Hull damage dealt760',
    )
    expect(text.match(/Shots fired/g)).toHaveLength(1)
    expect(markup.match(/<details/g)).toHaveLength(2) // round plus reading guide
    expect(text).not.toContain('Damage not recorded for this participant.')
  })

  it('explains detected espionage combat and lost probes without showing loot', () => {
    const { text } = render({
      payload: {
        ...combat,
        outcome: 'DefenderVictory',
        mission: 'Espionage',
        survivors: [{ ...attacker, units: [] }, defender],
      },
      viewer: 'defender',
    })
    expect(text).toContain('✓ Victory')
    expect(text).toContain(
      'Combat followed detection during espionage. No loot is taken.',
    )
    expect(text).toContain('6 permanently lost')
    expect(text).not.toContain('Loot')
  })

  it('public combat preserves published names and loot without a profile session', () => {
    const { text } = render({
      payload: combat,
      shared: true,
      playerNames: {
        attacker: 'Name at publication',
        defender: 'Defender at publication',
      },
    })
    expect(text).toContain('Attacker victory')
    expect(text).toContain('Name at publication')
    expect(text).toContain('Defender at publication')
    expect(text).toContain('Lootmetal10,713crystal8,238deuterium2,608')
  })

  it.each(['human', 'bot'] as const)(
    'public espionage uses the published %s identity',
    (kind) => {
      const markup = renderToStaticMarkup(
        createElement(
          PlayerKinds.Provider,
          {
            value: { 'participant-1': kind },
          },
          createElement(ReportObservation, {
            shared: true,
            playerNames: { 'participant-1': 'Harvester' },
            payload: {
              kind: 'Espionage',
              target: { owner: 'participant-1', kind: 'Planet' },
            },
          }),
        ),
      )
      expect(markup).toContain('Harvester')
      expect(markup.includes('aria-label="Bot"')).toBe(kind === 'bot')
      expect(markup).toContain('Coordinates hidden')
    },
  )
})
