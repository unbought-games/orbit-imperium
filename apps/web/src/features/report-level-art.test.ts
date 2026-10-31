import { expect, it } from 'vitest'
import { reportLevelArt } from './report-level-art'
import { reportBuildingRowTitle } from './report-buildings'

it('uses canonical catalog art for observed buildings and research', () => {
  expect(reportLevelArt('MetalMine')?.thumbnail).toBe(
    '/art/atlas/objects/metal-mine-96.webp',
  )
  expect(reportLevelArt('WeaponsTechnology')?.thumbnail).toBe(
    '/art/atlas/objects/weapons-technology-96.webp',
  )
  expect(reportLevelArt('LunarBase')?.thumbnail).toBe(
    '/art/atlas/objects/lunar-base-96.webp',
  )
})

it('does not invent image URLs for unknown historical IDs', () => {
  for (const id of [
    'FutureResearch',
    '../MetalMine',
    'constructor',
    '__proto__',
  ])
    expect(reportLevelArt(id)).toBeUndefined()
})

it('labels partial building rows without assuming the first catalog item was observed', () => {
  expect(reportBuildingRowTitle([['CrystalMine', 6]])).toBe('Mines')
  expect(reportBuildingRowTitle([['FusionReactor', 2]])).toBe('Power')
  expect(reportBuildingRowTitle([['DeuteriumTank', 0]])).toBe('Storage')
  expect(reportBuildingRowTitle([['NaniteFactory', 0]])).toBe('Production')
  expect(reportBuildingRowTitle([['ResearchLab', 3]])).toBe('Infrastructure')
  expect(reportBuildingRowTitle([['LegacyBuilding', 1]])).toBeUndefined()
  expect(reportBuildingRowTitle([])).toBeUndefined()
})
