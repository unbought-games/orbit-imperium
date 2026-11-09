import { describe, expect, it } from 'vitest'
import { planetNameError } from '../planet-name'
import { planetNameWords, randomPlanetName } from './names'

describe('random planet names', () => {
  it('produces only valid planet names', () => {
    for (const a of planetNameWords.first)
      for (const b of planetNameWords.second)
        expect(planetNameError(`${a} ${b}`)).toBe('')
  })
  it('stays within the word lists at the edges of the random range', () => {
    expect(randomPlanetName(() => 0)).toBe('Vesper Reach')
    expect(randomPlanetName(() => 0.999999)).toBe('Zephra Sanctum')
    expect(randomPlanetName(() => 1)).toBe('Zephra Sanctum')
  })
})
