import { expect, it } from 'vitest'
import { groupReportBuildings } from './report-buildings'

it('keeps mines, power, storage and related facilities on separate titled rows', () => {
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
      title: 'Mines',
      levels: [
        ['MetalMine', 7],
        ['CrystalMine', 6],
        ['DeuteriumSynthesizer', 4],
      ],
    },
    {
      title: 'Power',
      levels: [
        ['SolarPlant', 13],
        ['FusionReactor', 0],
      ],
    },
    {
      title: 'Storage',
      levels: [
        ['MetalStorage', 1],
        ['CrystalStorage', 1],
        ['DeuteriumTank', 0],
      ],
    },
    {
      title: 'Production',
      levels: [
        ['RoboticsFactory', 2],
        ['NaniteFactory', 1],
      ],
    },
    {
      title: 'Infrastructure',
      levels: [
        ['Shipyard', 2],
        ['ResearchLab', 2],
      ],
    },
  ]
  for (const ordered of [entries, [...entries].reverse()])
    expect(groupReportBuildings(Object.fromEntries(ordered), 'Planet')).toEqual(
      expected,
    )
})

it('titles partial rows without assuming the first catalog item was observed', () => {
  expect(
    groupReportBuildings({
      CrystalMine: 6,
      FusionReactor: 2,
      DeuteriumTank: 0,
      NaniteFactory: 0,
      ResearchLab: 3,
    }).map(({ title }) => title),
  ).toEqual(['Mines', 'Power', 'Storage', 'Production', 'Infrastructure'])
})

it('omits moon-only entries from planet observations without mutating them', () => {
  const observation = Object.freeze({
    LunarBase: 0,
    SensorPhalanx: 0,
    JumpGate: 1,
    RoboticsFactory: 2,
  })
  expect(groupReportBuildings(observation, 'Planet')).toEqual([
    { title: 'Production', levels: [['RoboticsFactory', 2]] },
  ])
  expect(observation.JumpGate).toBe(1)
  for (const kind of ['Moon', undefined])
    expect(groupReportBuildings(observation, kind)).toEqual([
      { title: 'Production', levels: [['RoboticsFactory', 2]] },
      {
        title: 'Facilities',
        levels: [
          ['LunarBase', 0],
          ['SensorPhalanx', 0],
          ['JumpGate', 1],
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
    { title: 'Power', levels: [['FusionReactor', 0]] },
    {
      title: 'Other buildings',
      levels: [
        ['ALegacyBuilding', '12'],
        ['ZLegacyBuilding', null],
      ],
    },
  ])
  expect(groupReportBuildings({})).toEqual([])
  expect(groupReportBuildings({ ResearchLab: 0 })).toEqual([
    { title: 'Infrastructure', levels: [['ResearchLab', 0]] },
  ])
})
