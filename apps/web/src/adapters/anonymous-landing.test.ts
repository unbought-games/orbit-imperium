import { describe, expect, it } from 'vitest'
import { anonymousLanding } from './anonymous-landing'

describe('anonymous landing startup boundary', () => {
  it('preserves the server registration gate', () => {
    for (const enabled of [true, false])
      expect(
        anonymousLanding({
          version: 1,
          signup_enabled: enabled,
          result: { status: 'anonymous' },
        }),
      ).toBe(enabled)
  })
  it('leaves authenticated, unavailable, unknown and malformed payloads to full startup', () => {
    for (const value of [
      null,
      {},
      { version: 2, signup_enabled: true, result: { status: 'anonymous' } },
      { version: 1, signup_enabled: 'true', result: { status: 'anonymous' } },
      ...['authenticated', 'unavailable', 'future'].map((status) => ({
        version: 1,
        signup_enabled: true,
        result: { status },
      })),
      {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous', session: {} },
      },
    ])
      expect(anonymousLanding(value)).toBeNull()
  })
})
