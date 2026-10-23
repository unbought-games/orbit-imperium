import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { BoundView } from '../client-model/commands'
import { readyFixture } from '../test-support/bootstrap'
import { ResourceStrip } from './resource-strip'
import styles from './resource-amount.module.css'

it.each([
  { amount: '0', capacity: '0', full: false },
  { amount: '0', capacity: '100', full: false },
  { amount: '99', capacity: '100', full: false },
  { amount: '100', capacity: '100', full: true },
  { amount: '101', capacity: '100', full: true },
])(
  'shows storage warnings for $amount/$capacity: $full',
  ({ amount, capacity, full }) => {
    const body: BoundView['bodies'][number] = {
      id: 'planet',
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: { metal: amount, crystal: amount, deuterium: amount },
      capacity: { metal: capacity, crystal: capacity, deuterium: capacity },
      levels: {
        MetalMine: 0,
        CrystalMine: 0,
        DeuteriumSynthesizer: 0,
        SolarPlant: 0,
        MetalStorage: 0,
        CrystalStorage: 0,
        DeuteriumTank: 0,
        RoboticsFactory: 0,
        ResearchLab: 0,
        Shipyard: 0,
      },
      fields: 10,
      fields_used: 0,
      fields_reserved: 0,
      energy: { supply: '0', demand: '0', utilization: '1000000' },
      inventories: [],
    }
    const view = readyFixture(4).snapshot.view as BoundView
    const strip = renderToStaticMarkup(
      createElement(ResourceStrip, { view, body }),
    )
    expect(strip.split(styles.warning).length - 1).toBe(full ? 3 : 0)
  },
)
