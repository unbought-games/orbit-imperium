import { describe, expect, it } from 'vitest'
import {
  missionLocation,
  arrivalCountdown,
  incomingManifest,
  observationAge,
  recallEstimate,
  shipManifest,
} from './mission-presentation'
import type { components } from '../contracts'

describe('mission presentation', () => {
  it('counts down exact seconds and never asserts arrival from the clock', () => {
    expect(arrivalCountdown(3661001, 0)).toBe('1h 1m 1s')
    expect(arrivalCountdown(454000, 0)).toBe('7m 34s')
    expect(arrivalCountdown(454000, 1000)).toBe('7m 33s')
    expect(arrivalCountdown(180000, 0)).toBe('3m 0s')
    expect(arrivalCountdown(60000, 0)).toBe('1m 0s')
    expect(arrivalCountdown(60000, 1000)).toBe('59s')
    expect(arrivalCountdown(3600000, 0)).toBe('1h 0m 0s')
    expect(arrivalCountdown(90061000, 0)).toBe('25h 1m 1s')
    expect(arrivalCountdown(1000, 999)).toBe('0s')
    expect(arrivalCountdown(1000, 0)).toBe('1s')
    expect(arrivalCountdown(1000, 1000)).toBe('Awaiting confirmation')
    expect(arrivalCountdown(1000, 2000)).toBe('Awaiting confirmation')
  })
  it('preserves counts above safe integer range and incoming visibility', () => {
    expect(
      shipManifest([{ ship_type: 'SmallCargo', count: '9007199254740993' }]),
    ).toBe('9007199254740993 Small Cargo')
    expect(incomingManifest({ visibility: 'Unknown' })).toBe(
      'Ship composition unknown',
    )
    expect(incomingManifest({ visibility: 'Total', total: '0' })).toBe(
      '0 ships · Types unknown',
    )
    expect(
      incomingManifest({
        visibility: 'Types',
        total: '3',
        types: ['SmallCargo'],
      }),
    ).toBe('3 ships · Small Cargo')
  })
  it('estimates recall from elapsed outbound travel only while recall is available', () => {
    const fleet = {
      launched_at: 1000,
      due_at: 10000,
      leg: 'Outbound',
      can_recall: true,
    } as components['schemas']['OwnMission4']
    expect(recallEstimate(fleet, 3000)).toBe(5000)
    expect(recallEstimate(fleet, 10000)).toBeNull()
    expect(recallEstimate({ ...fleet, leg: 'Returning' }, 3000)).toBeNull()
    expect(recallEstimate({ ...fleet, can_recall: false }, 3000)).toBeNull()
  })
  it('labels observation age without presenting historical data as current', () => {
    expect(observationAge(1000, 0)).toBe('Less than a minute ago')
    expect(observationAge(1000, 61000)).toBe('1m ago')
  })
})

it('labels current owned and public fleet destinations without changing recorded coordinates', () => {
  const view = {
    bodies: [{ id: 'home', name: 'Terra' }],
    destinations: [{ id: 'away', name: '世界 🪐' }],
  } as unknown as components['schemas']['GameView']
  const at = { galaxy: 1, system: 2, position: 3 }
  expect(missionLocation(view, 'home', at)).toBe('Terra [1:2:3]')
  expect(missionLocation(view, 'away', at)).toBe('世界 🪐 [1:2:3]')
  expect(missionLocation(view, 'unknown', at)).toBe('[1:2:3]')
  expect(missionLocation(view, undefined, at)).toBe('[1:2:3]')
})
