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
    'Attack power1Shield damage dealt0Hull damage dealtUnknown',
  )
  expect(text).not.toMatch(/\d\.\d/)
})
it('keeps exact integer probability context alongside floored percentages', () => {
  expect(
    render({ kind: 'SpyContact', probability_ppm: 53584, detected: false }),
  ).toContain('Counterespionage: 5% (53584 parts per million)')
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
