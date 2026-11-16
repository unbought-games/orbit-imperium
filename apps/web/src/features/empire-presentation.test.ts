import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { StationedUnits } from './empire-inventory'
import { EmpireWealth } from './empire-wealth'
import { empireFixture } from '../test-support/empire'
import { readyFixture } from '../test-support/bootstrap'

it.each(['Ship', 'Defense'] as const)(
  'renders only present positive %s inventory, with exact singular and large totals',
  (kind) => {
    const body = empireFixture().bodies[0]
    body.inventories = [
      { item: { kind: 'Ship', id: 'LargeCargo' }, count: '3' },
      { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '3' },
      { item: { kind: 'Ship', id: 'SmallCargo' }, count: '0' },
      { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '3' },
      { item: { kind: 'Defense', id: 'LightLaser' }, count: '2' },
      { item: { kind: 'Defense', id: 'HeavyLaser' }, count: '0' },
    ]
    const render = () =>
      renderToStaticMarkup(createElement(StationedUnits, { body, kind }))
    const initial = render()
    expect(initial).toContain(kind === 'Ship' ? '6 ships' : '5 defenses')
    expect(initial).toContain(
      kind === 'Ship'
        ? '<dt>Solar Satellite</dt><dd>3</dd>'
        : '<dt>Light Laser</dt><dd>2</dd>',
    )
    for (const excluded of kind === 'Ship'
      ? ['Small Cargo', 'Rocket Launcher', 'Light Laser']
      : ['Heavy Laser', 'Large Cargo', 'Solar Satellite'])
      expect(initial).not.toContain(excluded)
    for (const item of body.inventories)
      if (item.item.kind === kind) item.count = '0'
    expect(render()).toContain(
      kind === 'Ship'
        ? 'No ships stationed here.'
        : 'No defenses stationed here.',
    )
    expect(render()).not.toContain('<dt>')
    const items = body.inventories.filter((item) => item.item.kind === kind)
    items[0].count = '1'
    expect(render()).toContain(kind === 'Ship' ? '1 ship<' : '1 defense<')
    items[0].count = '9007199254740993'
    items[1].count = kind === 'Ship' ? '3' : '2'
    expect(render()).toContain(
      kind === 'Ship'
        ? '9,007,199,254,740,996 ships'
        : '9,007,199,254,740,995 defenses',
    )
  },
)

it('renders authoritative wealth breakdown and reserved launch cargo with canonical resource symbols', () => {
  const { snapshot } = readyFixture(4)
  const view = snapshot.view
  if (view.protocol !== 4) throw Error('fixture')
  const data = empireFixture()
  view.bodies = data.bodies
  view.missions = data.missions
  for (const body of view.bodies)
    body.amounts = {
      metal: '1000000',
      crystal: '2000000',
      deuterium: '3000000',
    }
  for (const fleet of view.missions.fleets) {
    fleet.cargo = { metal: '4000000', crystal: '5000000', deuterium: '6000000' }
    fleet.intent.cargo = {
      metal: '999000000',
      crystal: '999000000',
      deuterium: '999000000',
    }
  }
  const render = (
    pendingCargo: (typeof data.missions.fleets)[number]['cargo'][] = [],
  ) => renderToStaticMarkup(createElement(EmpireWealth, { view, pendingCargo }))
  const html = render()
  const total = (markup: string, resource: string) =>
    markup.match(
      new RegExp(
        `aria-label="${resource} wealth"[\\s\\S]*?<strong>(.*?)</strong>`,
      ),
    )?.[1]
  expect(total(html, 'metal')).toBe('16')
  expect(total(html, 'crystal')).toBe('23')
  expect(total(html, 'deuterium')).toBe('30')
  for (const resource of ['metal', 'crystal', 'deuterium'])
    expect(html).toContain(`data-resource="${resource}"`)
  expect(html.match(/On planets and moons<\/span>/g)).toHaveLength(3)
  expect(html.match(/On active fleets<\/span>/g)).toHaveLength(3)
  expect(html).not.toContain('Launching')
  const reserved = render([{ metal: '7000000', crystal: '0', deuterium: '0' }])
  expect(total(reserved, 'metal')).toBe('23')
  expect(total(reserved, 'crystal')).toBe('23')
  expect(reserved).toContain('Launching')
  view.missions.fleets = []
  expect(render().match(/<dd>0<\/dd>/g)).toHaveLength(3)
})
