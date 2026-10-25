import { expect, it } from 'vitest'
import { groupReportResearch } from './report-research'

it('groups all current research in explicit report order regardless of payload order', () => {
  const expected = [
    {
      title: 'Combat and espionage',
      rows: [
        ['WeaponsTechnology', 8],
        ['ShieldingTechnology', 7],
        ['ArmourTechnology', 6],
        ['EspionageTechnology', 5],
      ],
    },
    {
      title: 'Drive research',
      rows: [
        ['CombustionDrive', 4],
        ['ImpulseDrive', 3],
        ['HyperspaceDrive', 0],
      ],
    },
    {
      title: 'Basic research',
      rows: [
        ['EnergyTechnology', 5],
        ['LaserTechnology', 4],
        ['IonTechnology', 3],
        ['HyperspaceTechnology', 2],
        ['PlasmaTechnology', 1],
      ],
    },
    {
      title: 'Advanced research',
      rows: [
        ['ComputerTechnology', 4],
        ['Astrophysics', 3],
        ['IntergalacticResearchNetwork', 2],
        ['GravitonTechnology', 0],
      ],
    },
  ]
  const rows = expected.flatMap((group) => group.rows)
  for (const entries of [rows, [...rows].reverse(), [...rows].sort()]) {
    expect(groupReportResearch(Object.fromEntries(entries))).toEqual(expected)
  }
})

it('retains zero and unknown levels and sorts future IDs without mutating observations', () => {
  const observation = Object.freeze({
    ZFutureResearch: null,
    EspionageTechnology: 0,
    AFutureResearch: '12',
    HyperspaceDrive: 'Unknown',
  })
  expect(groupReportResearch(observation)).toEqual([
    { title: 'Combat and espionage', rows: [['EspionageTechnology', 0]] },
    { title: 'Drive research', rows: [['HyperspaceDrive', 'Unknown']] },
    {
      title: 'Other research',
      rows: [
        ['AFutureResearch', '12'],
        ['ZFutureResearch', null],
      ],
    },
  ])
})

it('omits empty groups and never invents unobserved levels', () => {
  expect(groupReportResearch({})).toEqual([])
  expect(groupReportResearch({ ComputerTechnology: 0 })).toEqual([
    { title: 'Advanced research', rows: [['ComputerTechnology', 0]] },
  ])
})
