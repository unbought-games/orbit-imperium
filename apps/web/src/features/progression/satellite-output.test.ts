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
