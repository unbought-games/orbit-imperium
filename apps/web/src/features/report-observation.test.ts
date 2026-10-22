import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ReportObservation } from './report-observation'

const render = (payload: Record<string, unknown>) =>
  renderToStaticMarkup(createElement(ReportObservation, { payload })).replace(
    /<[^>]+>/g,
    '',
  )

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
    'Raw attack 1 points · Shield damage 0 · Hull damage Unknown',
  )
  expect(text).not.toMatch(/\d\.\d/)
})
it('keeps exact integer probability context alongside floored percentages', () => {
  expect(
    render({ kind: 'SpyContact', probability_ppm: 53584, detected: false }),
  ).toContain('Counterespionage: 5% (53584 parts per million)')
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
  expect(markup.match(/Vega &lt;Commander&gt;/g)).toHaveLength(7)
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
