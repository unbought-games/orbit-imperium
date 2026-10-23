import { expect, it } from 'vitest'
import { groupReportBuildings } from './report-buildings'

it('groups alphabetized observations in resource and facility catalog order', () => {
  expect(
    groupReportBuildings({
      CrystalMine: 6,
      CrystalStorage: 1,
      DeuteriumSynthesizer: 4,
      DeuteriumTank: 0,
      MetalMine: 7,
      MetalStorage: 1,
      ResearchLab: 2,
      RoboticsFactory: 2,
      Shipyard: 2,
      SolarPlant: 9,
    }),
  ).toEqual([
    {
      title: 'Resource buildings',
      rows: [
        ['MetalMine', 7],
        ['CrystalMine', 6],
        ['DeuteriumSynthesizer', 4],
        ['SolarPlant', 9],
        ['MetalStorage', 1],
        ['CrystalStorage', 1],
        ['DeuteriumTank', 0],
      ],
    },
    {
      title: 'Facility buildings',
      rows: [
        ['RoboticsFactory', 2],
        ['Shipyard', 2],
        ['ResearchLab', 2],
      ],
    },
  ])
})

it('retains expanded, moon and unknown catalog observations without inventing levels', () => {
  const observation = Object.freeze({
    JumpGate: 1,
    ZLegacyBuilding: null,
    FusionReactor: 0,
    SensorPhalanx: 7,
    NaniteFactory: 'Unknown',
    LunarBase: 3,
    ALegacyBuilding: '12',
  })
  expect(groupReportBuildings(observation)).toEqual([
    { title: 'Resource buildings', rows: [['FusionReactor', 0]] },
    {
      title: 'Facility buildings',
      rows: [
        ['NaniteFactory', 'Unknown'],
        ['LunarBase', 3],
        ['SensorPhalanx', 7],
        ['JumpGate', 1],
      ],
    },
    {
      title: 'Other buildings',
      rows: [
        ['ALegacyBuilding', '12'],
        ['ZLegacyBuilding', null],
      ],
    },
  ])
})

it('omits empty groups and never adds unobserved catalog entries', () => {
  expect(groupReportBuildings({})).toEqual([])
  expect(groupReportBuildings({ ResearchLab: 0 })).toEqual([
    { title: 'Facility buildings', rows: [['ResearchLab', 0]] },
  ])
})
