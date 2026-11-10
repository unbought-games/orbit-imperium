import type { BoundProgressionOptions } from '../../client-model/commands'
import { readyFixture } from '../../test-support/bootstrap'
import type { ProgressionProps } from './shared'

/** Minimal unit fixture: no browser, timers, network, or other test imports. */
export function progressionFixture() {
  const { snapshot } = readyFixture(4)
  const view = snapshot.view as ProgressionProps['view']
  view.bodies = [
    {
      id: 'planet',
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      amounts: {
        metal: '1000000000',
        crystal: '1000000000',
        deuterium: '1000000000',
      },
      capacity: {
        metal: '1000000000',
        crystal: '1000000000',
        deuterium: '1000000000',
      },
      levels: {
        MetalMine: 1,
        CrystalMine: 1,
        DeuteriumSynthesizer: 1,
        SolarPlant: 1,
        MetalStorage: 0,
        CrystalStorage: 0,
        DeuteriumTank: 0,
        RoboticsFactory: 0,
        ResearchLab: 1,
        Shipyard: 1,
      },
      fields: 100,
      fields_used: 6,
      fields_reserved: 0,
      energy: { supply: '100', demand: '50', utilization: '1000000' },
      inventories: [],
    },
  ]
  const source: BoundProgressionOptions = {
    protocol: 4,
    binding: view.binding,
    request_id: 'quote',
    viewer_revision: '0',
    sampled_at: 1000,
    as_of_ms: 1000,
    request: {
      type: 'Manufacture',
      body: 'planet',
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
    },
    terms_hash: 'b'.repeat(64),
    blockers: [],
    estimates: null,
    terms: {
      type: 'Manufacture',
      profile_hash: view.profile_hash,
      body: 'planet',
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '1',
      paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      unit_cost: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      unit_duration_ms: 30000,
      formula: 'ManufactureClassic',
      facilities: [],
    },
  }
  return { view, source }
}

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
