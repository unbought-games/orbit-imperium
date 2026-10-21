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
