import { describe, expect, it } from 'vitest'
import {
  absoluteTimestamp,
  formatCountdown,
  timestampMilliseconds,
} from './timestamp-format'

describe('timestamp instants and display', () => {
  it('accepts absolute instants and rejects ambiguous local strings or invalid dates', () => {
    const expected = 1794600000123
    expect(timestampMilliseconds('2026-11-13T15:00:00.123-05:00')).toBe(
      expected,
    )
    expect(timestampMilliseconds(new Date(expected))).toBe(expected)
    expect(timestampMilliseconds(expected)).toBe(expected)
    for (const value of [
      '2026-11-13T15:00:00',
      '2026-11-13',
      'invalid',
      NaN,
      Infinity,
      9e15,
      new Date(NaN),
    ])
      expect(timestampMilliseconds(value)).toBeNull()
    expect(absoluteTimestamp('invalid', 'en-US', 'UTC').local).toBe(
      'Time unavailable',
    )
  })
  it('keeps seconds and fractions in exact copies, across midnight in the local zone', () => {
    const time = absoluteTimestamp(
      '2026-11-14T02:02:11.123Z',
      'en-US',
      'America/New_York',
    )
    expect(time.local).toBe('Nov 13, 2026, 21:02:11 EST')
    expect(time.utc).toBe('Nov 14, 2026, 02:02:11 UTC')
    expect(time.localCopy).toBe(
      '2026-11-13T21:02:11.123-05:00 [America/New_York]',
    )
    expect(time.utcCopy).toBe('2026-11-14T02:02:11.123Z')
  })
  it('distinguishes repeated Eastern hours at the daylight-saving transition', () => {
    expect(
      absoluteTimestamp('2026-11-01T05:30:00Z', 'en-US', 'America/New_York')
        .localCopy,
    ).toBe('2026-11-01T01:30:00.000-04:00 [America/New_York]')
    expect(
      absoluteTimestamp('2026-11-01T06:30:00Z', 'en-US', 'America/New_York')
        .localCopy,
    ).toBe('2026-11-01T01:30:00.000-05:00 [America/New_York]')
    expect(
      absoluteTimestamp('2026-11-13T20:00:00Z', 'en-US', 'Asia/Kolkata')
        .localCopy,
    ).toBe('2026-11-14T01:30:00.000+05:30 [Asia/Kolkata]')
  })
  it('counts down without rounding away seconds or declaring completion', () => {
    expect(formatCountdown(131000)).toBe('in 2m 11s')
    expect(formatCountdown(90061000)).toBe('in 1d 1h 1m 1s')
    expect(formatCountdown(1)).toBe('in 1s')
    expect(formatCountdown(0)).toBe('now')
    expect(formatCountdown(-1000)).toBe('1s ago')
  })
  it('describes both future and past events', () => {
    expect(formatCountdown(-131000)).toBe('2m 11s ago')
    expect(formatCountdown(-300000)).toBe('5m ago')
    expect(formatCountdown(-1)).toBe('now')
  })
})
