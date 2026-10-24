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
    loot: {
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
  ).toContain('BuildingsKnown empty')
})

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
