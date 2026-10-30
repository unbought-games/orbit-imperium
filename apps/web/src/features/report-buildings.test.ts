import { expect, it } from 'vitest'
import { groupReportBuildings } from './report-buildings'

it('keeps mines, power, storage and related facilities on separate rows', () => {
  const entries = [
    ['CrystalMine', 6],
    ['CrystalStorage', 1],
    ['DeuteriumSynthesizer', 4],
    ['DeuteriumTank', 0],
    ['MetalMine', 7],
    ['MetalStorage', 1],
    ['ResearchLab', 2],
    ['RoboticsFactory', 2],
    ['NaniteFactory', 1],
    ['Shipyard', 2],
    ['SolarPlant', 13],
    ['FusionReactor', 0],
  ] as const
  const expected = [
    {
      title: 'Resource buildings',
      rows: [
        [
          ['MetalMine', 7],
          ['CrystalMine', 6],
          ['DeuteriumSynthesizer', 4],
        ],
        [
          ['SolarPlant', 13],
          ['FusionReactor', 0],
        ],
        [
          ['MetalStorage', 1],
          ['CrystalStorage', 1],
          ['DeuteriumTank', 0],
        ],
      ],
    },
    {
      title: 'Facility buildings',
      rows: [
        [
          ['RoboticsFactory', 2],
          ['NaniteFactory', 1],
        ],
        [
          ['Shipyard', 2],
          ['ResearchLab', 2],
        ],
      ],
    },
  ]
  for (const ordered of [entries, [...entries].reverse()])
    expect(groupReportBuildings(Object.fromEntries(ordered), 'Planet')).toEqual(
      expected,
    )
})

it('omits moon-only entries from planet observations without mutating them', () => {
  const observation = Object.freeze({
    LunarBase: 0,
    SensorPhalanx: 0,
    JumpGate: 1,
    RoboticsFactory: 2,
  })
  expect(groupReportBuildings(observation, 'Planet')).toEqual([
    { title: 'Facility buildings', rows: [[['RoboticsFactory', 2]]] },
  ])
  expect(observation.JumpGate).toBe(1)
  for (const kind of ['Moon', undefined])
    expect(groupReportBuildings(observation, kind)).toEqual([
      {
        title: 'Facility buildings',
        rows: [
          [['RoboticsFactory', 2]],
          [
            ['LunarBase', 0],
            ['SensorPhalanx', 0],
            ['JumpGate', 1],
          ],
        ],
      },
    ])
})

it('retains unknown IDs and observed zero levels without filling missing entries', () => {
  expect(
    groupReportBuildings(
      { FusionReactor: 0, ZLegacyBuilding: null, ALegacyBuilding: '12' },
      'Planet',
    ),
  ).toEqual([
    { title: 'Resource buildings', rows: [[['FusionReactor', 0]]] },
    {
      title: 'Other buildings',
      rows: [
        [
          ['ALegacyBuilding', '12'],
          ['ZLegacyBuilding', null],
        ],
      ],
    },
  ])
  expect(groupReportBuildings({})).toEqual([])
  expect(groupReportBuildings({ ResearchLab: 0 })).toEqual([
    { title: 'Facility buildings', rows: [[['ResearchLab', 0]]] },
  ])
})
