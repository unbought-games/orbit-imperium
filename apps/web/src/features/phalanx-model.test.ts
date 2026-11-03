import { describe, expect, it } from 'vitest'
import { phalanxRange, scanBlocker } from './phalanx-model'
import type { components } from '../contracts'
type S = components['schemas']
const source = {
  kind: 'Moon',
  levels: { SensorPhalanx: 3 },
  coordinates: { galaxy: 1, system: 100, position: 1 },
  amounts: { metal: '0', crystal: '0', deuterium: '5000000000' },
} as Pick<S['BodyV3'], 'kind' | 'levels' | 'coordinates' | 'amounts'>
const target = {
  coordinates: { galaxy: 1, system: 108, position: 1 },
  body: { kind: 'Planet', owner: 'other', vacation: false },
} as S['GalaxyPosition4']
describe('phalanx eligibility hints', () => {
  it('includes exact range and local fuel boundaries', () => {
    expect(phalanxRange(1)).toBe(0n)
    expect(scanBlocker(source, target, 'me')).toBeNull()
    expect(
      scanBlocker(
        source,
        { ...target, coordinates: { ...target.coordinates, system: 109 } },
        'me',
      ),
    ).toContain('outside')
    expect(
      scanBlocker(
        { ...source, amounts: { ...source.amounts, deuterium: '4999999999' } },
        target,
        'me',
      ),
    ).toContain('locally')
  })
  it('rejects wrong bodies, own and vacation targets without hostile score checks', () => {
    expect(scanBlocker({ ...source, kind: 'Planet' }, target, 'me')).toContain(
      'moon',
    )
    expect(scanBlocker(source, target, 'other')).toContain('own')
    expect(
      scanBlocker(
        source,
        { ...target, body: { ...target.body!, vacation: true } },
        'me',
      ),
    ).toContain('vacation')
    expect(
      scanBlocker(
        source,
        {
          ...target,
          body: { ...target.body!, attack_blocker: 'BeginnerProtected' },
        },
        'me',
      ),
    ).toBeNull()
  })
})
