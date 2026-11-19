import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { productionFixture } from '../../test-support/production'
import { progressionFixture } from './progression-test-fixture'
import { SatelliteOutput } from './satellite-output'

function energyText(kind: 'Planet' | 'Moon') {
  const { view } = progressionFixture()
  const body = view.bodies[0]
  body.kind = kind
  const production = productionFixture(body)
  production.solar_satellite = {
    unit_energy: '31000000',
    energy_supply: '93000000',
  }
  view.progression.production = [production]
  return renderToStaticMarkup(
    createElement(SatelliteOutput, {
      view,
      body,
      inventory: { stationed: '3', ordered: '0' },
      quantity: '10',
    }),
  ).replace(/<[^>]+>/g, '')
}

it('shows just the unit output and order gain at full production', () => {
  expect(energyText('Planet')).toBe(
    'Planet energy per satellite31Energy added310',
  )
})

it('explains lunar output in a single note', () => {
  expect(energyText('Moon')).toBe(
    'Solar Satellites produce no energy on moons.',
  )
})

it('uses only the selected body’s authoritative output with zero stationed satellites', () => {
  const { view } = progressionFixture()
  const [home] = view.bodies
  const colony = { ...home, id: 'colony' }
  view.bodies = [home, colony]
  view.progression.production = [home, colony].map((body, index) => ({
    ...productionFixture(body),
    solar_satellite: {
      unit_energy: index ? '27000000' : '31000000',
      energy_supply: '0',
    },
  }))
  const show = (body: typeof home) =>
    renderToStaticMarkup(
      createElement(SatelliteOutput, {
        body,
        view,
        quantity: '3',
        inventory: { stationed: '0', ordered: '0' },
      }),
    ).replace(/<[^>]+>/g, '')
  expect(show(home)).toBe('Planet energy per satellite31Energy added93')
  expect(show(colony)).toBe('Planet energy per satellite27Energy added81')
  view.progression.production = view.progression.production.slice(0, 1)
  expect(show(colony)).toBe(
    'Satellite energy data unavailable for this planet.',
  )
})
