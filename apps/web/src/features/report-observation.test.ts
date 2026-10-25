import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ReportObservation } from './report-observation'
import { PlayerProfilesContext } from '../shell/player-profiles-context'
import { PlayerProfilesController } from '../client-model/player-profiles'

const profiles = new PlayerProfilesController(async () => {
  throw Error('No network in static rendering')
})

const render = (payload: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(
      PlayerProfilesContext.Provider,
      { value: profiles },
      createElement(ReportObservation, { payload }),
    ),
  ).replace(/<[^>]+>/g, '')

it('floors combat points and resource observations while preserving unknown data', () => {
  const text = render({
    kind: 'Combat',
    outcome: 'Draw',
    mission: 'Attack',
    debris: {
      metal: '1999999',
      crystal: '9007199254740993123456',
      deuterium: 'invalid',
    },
    rounds: [
      {
        number: 1,
        shots: 2,
        raw_attack_ticks: '199999',
        shield_removed_ticks: '99999',
        hull_removed_ticks: 'invalid',
        explosions: 0,
      },
    ],
  })
  expect(text).toContain('metal1crystal9,007,199,254,740,993deuteriumUnknown')
  expect(text).toContain(
    'Attack power1Shield damage dealt0Hull damage dealtUnknown',
  )
  expect(text).not.toMatch(/\d\.\d/)
})
it('keeps exact integer probability context alongside floored percentages', () => {
  expect(
    render({ kind: 'SpyContact', probability_ppm: 53584, detected: false }),
  ).toContain('Counterespionage: 5% (53584 parts per million)')
})

it('renders only observed building levels under catalog group headings', () => {
  const text = render({
    kind: 'Espionage',
    buildings: {
      visibility: 'Known',
      value: { ResearchLab: 2, MetalMine: null, LegacyBuilding: 0 },
    },
  })
  expect(text).toContain(
    'BuildingsResource buildingsMetal MineLevel UnknownFacility buildingsResearch LabLevel 2Other buildingsLegacy BuildingLevel 0',
  )
  expect(text).not.toContain('Crystal Mine')
})

it('keeps hidden buildings distinct from an observed empty section', () => {
  const hidden = render({
    kind: 'Espionage',
    buildings: { visibility: 'Unknown', value: { MetalMine: 30 } },
  })
  expect(hidden).toContain(
    'BuildingsUnknown — this observation did not reveal this section.',
  )
  expect(hidden).not.toContain('Resource buildings')
  expect(hidden).not.toContain('Metal Mine')
  expect(
    render({
      kind: 'Espionage',
      buildings: { visibility: 'Known', value: {} },
    }),
  ).toContain('BuildingsNo buildings')
})

it('renders observed research in report groups without inventing missing levels', () => {
  const text = render({
    kind: 'Espionage',
    research: {
      visibility: 'Known',
      value: {
        ComputerTechnology: 2,
        CombustionDrive: 3,
        EnergyTechnology: null,
        EspionageTechnology: 0,
        WeaponsTechnology: 4,
        FutureResearch: 1,
      },
    },
  })
  expect(text).toContain(
    'ResearchCombat and espionageWeapons TechnologyLevel 4Espionage TechnologyLevel 0Drive researchCombustion DriveLevel 3Basic researchEnergy TechnologyLevel UnknownAdvanced researchComputer TechnologyLevel 2Other researchFuture ResearchLevel 1',
  )
  expect(text).not.toContain('Shielding Technology')
})

it.each([
  undefined,
  { visibility: 'Unknown', value: { WeaponsTechnology: 30 } },
  { visibility: 'Unavailable', value: { WeaponsTechnology: 30 } },
])(
  'never renders research groups for unrevealed intelligence (%j)',
  (research) => {
    const text = render({ kind: 'Espionage', research })
    expect(text).toContain(
      'ResearchUnknown — this observation did not reveal this section.',
    )
    expect(text).not.toContain('Combat and espionage')
    expect(text).not.toContain('Weapons Technology')
    expect(text).not.toContain('No research')
  },
)

it('leads a contact-lost report with the known fleet loss without inventing the defender result', () => {
  const text = render({
    kind: 'ContactLost',
    target: { galaxy: 1, system: 1, position: 1 },
    own_lost_ships: [{ ship_type: 'LightFighter', count: '1000' }],
    own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
  })
  expect(text).toContain('Your fleet was destroyed')
  expect(text).toContain('The defender’s outcome is unknown.')
  expect(text).toContain('Light Fighter1,000')
  expect(text).not.toContain('Defender victory')
  expect(text).not.toContain('How the battle unfolded')
})

it('uses public names consistently across combat rounds and espionage with safe fallback', () => {
  const owner = '9516d363-0000-4000-8000-000000000001'
  const unknown = 'afcb76c1-0000-4000-8000-000000000002'
  const playerNames = { [owner]: 'Vega <Commander>' }
  const origin = { owner, side: 'Attacker', units: [] }
  const markup = renderToStaticMarkup(
    createElement(ReportObservation, {
      playerNames,
      payload: {
        kind: 'Combat',
        participants: [origin, { owner: unknown, side: 'Defender' }],
        survivors: [origin],
        gross_losses: [origin],
        recovered: [origin],
        permanent_losses: [origin],
        rounds: [{ start: [origin], end: [origin] }],
      },
    }),
  )
  expect(
    markup
      .match(/<h3>.*?<\/h3>/g)
      ?.map((heading) => heading.replace(/<[^>]+>/g, '')),
  ).toContain('Vega &lt;Commander&gt;')
  expect(
    markup
      .match(/<h4>.*?<\/h4>/g)
      ?.map((heading) => heading.replace(/<[^>]+>/g, '')),
  ).toContain('Attacker · Vega &lt;Commander&gt;')
  expect(markup).toContain('Player afcb76c1')
  expect(markup).not.toContain('Player 9516d363')
  for (const payload of [
    { kind: 'Espionage', target: { owner } },
    { kind: 'SpyContact', sender: owner },
  ]) {
    expect(
      renderToStaticMarkup(
        createElement(ReportObservation, { payload, playerNames }),
      ),
    ).toContain('Vega &lt;Commander&gt;')
  }
})

it('places historical target identity first and activity and detection after all intelligence', () => {
  const markup = renderToStaticMarkup(
    createElement(ReportObservation, {
      playerNames: { player: 'Commander Vega' },
      targetActions: createElement('button', null, 'Attack'),
      payload: {
        kind: 'Espionage',
        target: {
          body: 'target',
          owner: 'player',
          kind: 'Planet',
          name: 'Nova Roma',
          coordinates: { galaxy: 1, system: 1, position: 11 },
        },
        resources: {
          visibility: 'Known',
          value: {
            metal: '18763000000',
            crystal: '10441000000',
            deuterium: '560000000',
          },
        },
        activity: { type: 'Minutes', minutes: 20 },
        counterespionage: { probability_ppm: 0, detected: false },
      },
    }),
  )
  const text = markup.replace(/<[^>]+>/g, '')
  expect(text).toContain('Commander Vega')
  expect(text).toContain('Nova Roma · [1:1:11]')
  expect(markup).toContain('/planet-11-96.webp')
  expect(text.indexOf('Attack')).toBeLessThan(text.indexOf('Resources'))
  expect(text.indexOf('Research')).toBeLessThan(
    text.indexOf('Activity before contact: 20 minutes'),
  )
  expect(text.indexOf('Research')).toBeLessThan(
    text.indexOf('Counterespionage: 0%'),
  )
  expect(markup.match(/<svg[^>]+data-resource=/g)).toHaveLength(3)
  expect(text).toContain('18,76310,441560')
})

it.each(['Delivered', 'Returned', 'Deployed', 'Colonized', 'ContactLost'])(
  'uses resource symbols in %s report details',
  (kind) => {
    const resources = {
      metal: '1000000',
      crystal: '2000000',
      deuterium: '3000000',
    }
    const markup = renderToStaticMarkup(
      createElement(ReportObservation, {
        payload: {
          kind,
          cargo: resources,
          resources,
          own_cargo_loss: resources,
        },
      }),
    )
    for (const resource of ['metal', 'crystal', 'deuterium']) {
      expect(markup).toContain(`data-resource="${resource}"`)
      expect(markup).toContain(`color:var(--resource-${resource})`)
    }
  },
)

it.each([
  ['fleet', [], 'No stationed ships'],
  ['defenses', [], 'No defenses'],
  ['buildings', {}, 'No buildings'],
  ['research', {}, 'No research'],
])(
  'describes an empty %s section plainly without confusing it with unrevealed intelligence',
  (section, value, message) => {
    const revealed = render({
      kind: 'Espionage',
      [section as string]: { visibility: 'Known', value },
    })
    expect(revealed).toContain(message)
    expect(revealed).not.toContain('Known empty')
    const hidden = render({
      kind: 'Espionage',
      [section as string]: { visibility: 'Unknown' },
    })
    expect(hidden).not.toContain(message)
    expect(hidden).toContain(
      'Unknown — this observation did not reveal this section.',
    )
  },
)

const targetCoordinates = { galaxy: 2, system: 3, position: 4 }
it.each(['Combat', 'Espionage'])(
  'renders %s historical body identity with shared fallbacks',
  (kind) => {
    for (const [name, bodyKind, expected] of [
      ['Nova Roma', 'Planet', 'Nova Roma'],
      ['Luna', 'Moon', 'Luna (Moon)'],
      [null, 'Planet', 'Planet'],
      ['   ', 'Moon', 'Moon'],
      [42, 'Planet', 'Planet'],
      [
        '<script>alert(1)</script>',
        'Planet',
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      ],
    ]) {
      const identity =
        kind === 'Combat'
          ? {
              target: targetCoordinates,
              target_name: name,
              target_kind: bodyKind,
            }
          : { target: { coordinates: targetCoordinates, name, kind: bodyKind } }
      expect(render({ kind, ...identity })).toContain(`${expected} · [2:3:4]`)
    }
  },
)
it('keeps legacy combat coordinates and never borrows identity for contact-lost reports', () => {
  expect(render({ kind: 'Combat', target: targetCoordinates })).toContain(
    'Combat report · [2:3:4]',
  )
  expect(render({ kind: 'Combat', target_name: 'Nova Roma' })).toContain(
    'Nova Roma · Unavailable',
  )
  const restricted = render({
    kind: 'ContactLost',
    target: targetCoordinates,
    target_name: 'Hidden',
    target_kind: 'Moon',
  })
  expect(restricted).toContain('Combat report · [2:3:4]')
  expect(restricted).not.toContain('Hidden')
  expect(restricted).not.toContain('Moon')
})
