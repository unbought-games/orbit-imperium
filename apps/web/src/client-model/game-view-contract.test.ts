import { describe, expect, it } from 'vitest'
import type { components } from '../contracts'
import { bootstrapFixture, id } from '../test-support/bootstrap'
import { productionFixture } from '../test-support/production'
import { ContractDataError, validate } from './schema'

type S = components['schemas']
function snapshotFixture(protocol: 3 | 4) {
  const bootstrap = bootstrapFixture(protocol)
  if (
    bootstrap.result.status !== 'authenticated' ||
    bootstrap.result.game.status !== 'ready'
  )
    throw Error('fixture')
  const snapshot = bootstrap.result.game.snapshot
  if (snapshot.view.protocol === 2) throw Error('fixture')
  const body: S['BodyV3'] = {
    id: id(20),
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 1, position: 1 },
    amounts: { metal: '0', crystal: '0', deuterium: '0' },
    capacity: {
      metal: '10000000000',
      crystal: '10000000000',
      deuterium: '10000000000',
    },
    energy: { supply: '0', demand: '0', utilization: '1000000' },
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
    fields: 163,
    fields_used: 0,
    fields_reserved: 0,
    inventories: [],
  }
  snapshot.view.bodies = [
    body,
    { ...body, id: id(21), coordinates: { galaxy: 1, system: 1, position: 2 } },
  ]
  snapshot.view.progression.production = snapshot.view.bodies.map((b) => ({
    ...productionFixture(b),
    gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
  }))
  return { bootstrap, snapshot, view: snapshot.view }
}

describe.each([3, 4] as const)(
  'protocol %i production snapshot contract',
  (protocol) => {
    it('accepts zero-output bodies and settings regardless of array order', () => {
      const { view } = snapshotFixture(protocol)
      view.progression.production.reverse()
      expect(validate('GameView', view)).toBe(view)
      expect(view.progression.production[0].settings.metal_mine).toBe(100)
    })

    it.each(['missing', 'duplicate', 'foreign', 'extra'] as const)(
      'rejects %s production records at every snapshot entry point',
      (defect) => {
        const { bootstrap, snapshot, view } = snapshotFixture(protocol)
        const records = view.progression.production
        if (defect === 'missing') records.pop()
        if (defect === 'duplicate') records[1] = records[0]
        if (defect === 'foreign') records[1] = { ...records[1], body: id(99) }
        if (defect === 'extra') records.push({ ...records[0], body: id(99) })
        for (const [name, value] of [
          ['GameView', view],
          [`BoundView${protocol}`, view],
          ['InitialGameSnapshot', snapshot],
          ['Bootstrap', bootstrap],
        ] as const)
          expect(() => validate(name, value)).toThrow(ContractDataError)
      },
    )

    it('allows an empty owned-body list with an empty production list', () => {
      const { view } = snapshotFixture(protocol)
      view.bodies = []
      view.progression.production = []
      expect(validate('GameView', view)).toBe(view)
    })
  },
)
