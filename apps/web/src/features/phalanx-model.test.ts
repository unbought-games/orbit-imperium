import { describe, expect, it } from 'vitest'
import { phalanxRange, scanAttempts, scanBlocker } from './phalanx-model'
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

it('keeps the last paid report through pending, uncertain and rejected rescans', () => {
  const binding = {
    account: 'account',
    player: 'me',
    universe: 'universe',
    epoch: 'epoch',
  }
  const saved: S['Attempt4'] = {
    envelope: {
      protocol: 4,
      binding,
      command_id: 'first',
      presence: null,
      command: {
        type: 'World',
        action: {
          type: 'ScanPlanet',
          source_moon: 'moon',
          target_planet: 'planet',
        },
      },
    },
    status: 'committed',
    reconciled: true,
    receipt: {
      protocol: 4,
      binding,
      command_id: 'first',
      admitted_at: 1,
      executed_at: 1,
      status: 'Committed',
      result_ids: ['saved-report'],
      minimum_viewer_revision: '1',
    },
  }
  for (const status of ['pending', 'uncertain', 'rejected'] as const) {
    const retry: S['Attempt4'] = {
      ...saved,
      envelope: { ...saved.envelope, command_id: 'retry' },
      status,
      reconciled: false,
      receipt:
        status === 'rejected'
          ? {
              protocol: 4,
              binding,
              command_id: 'retry',
              admitted_at: 2,
              executed_at: 2,
              status: 'Rejected',
              code: 'InsufficientResources',
            }
          : null,
    }
    expect(scanAttempts([saved, retry], 'moon', 'planet')).toEqual({
      attempt: retry,
      report: 'saved-report',
    })
    expect(scanAttempts([saved, retry], 'other-moon', 'planet')).toEqual({
      attempt: undefined,
      report: undefined,
    })
    expect(scanAttempts([saved, retry], 'moon', 'other-planet')).toEqual({
      attempt: undefined,
      report: undefined,
    })
  }
  const newer: S['Attempt4'] = {
    ...saved,
    receipt: {
      ...saved.receipt!,
      status: 'Committed',
      executed_at: 3,
      result_ids: ['new-report'],
      minimum_viewer_revision: '2',
    },
  }
  expect(scanAttempts([saved, newer], 'moon', 'planet').report).toBe(
    'new-report',
  )
})
