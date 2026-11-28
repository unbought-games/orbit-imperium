import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it, expect } from 'vitest'
import { MoonDestructionOutcome, destructionChance } from './moon-destruction'

it('shows independently resolved moon and fleet results including a surviving moon with a lost attacking fleet', () => {
  const html = renderToStaticMarkup(
    createElement(MoonDestructionOutcome, {
      outcome: {
        moon_chance_ppm: 333850,
        fleet_loss_ppm: 447213,
        diameter_km: 8000,
        surviving_dreadnoughts: '10',
        moon_destroyed: false,
        fleet_lost: true,
      },
    }),
  )
  expect(html).toContain('Moon survived')
  expect(html).toContain('33.385%')
  expect(html).toContain('44.7213%')
  expect(html).toContain('lost with all escorts, cargo and loot')
  expect(destructionChance(1)).toBe('0.0001%')
  expect(renderToStaticMarkup(createElement(MoonDestructionOutcome))).toContain(
    'needed a victory and a surviving Dreadnought',
  )
})
