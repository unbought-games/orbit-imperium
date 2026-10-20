import { it, expect } from 'vitest'
import { validateInitialGame } from './bootstrap'
import { readyFixture, id } from '../test-support/bootstrap'
it('accepts compatible initial views for all supported protocols', () => {
  for (const p of [2, 3, 4] as const) {
    const { session, snapshot } = readyFixture(p)
    expect(validateInitialGame(session, snapshot).view.protocol).toBe(p)
  }
})
it('rejects mismatched identities, correlation, profile, speed and quantities', () => {
  for (const field of ['account', 'player', 'universe', 'epoch'] as const) {
    const { session, snapshot } = readyFixture()
    snapshot.view.binding = { ...snapshot.view.binding, [field]: id(99) }
    expect(() => validateInitialGame(session, snapshot)).toThrow()
  }
  for (const mutate of [
    (s: ReturnType<typeof readyFixture>) => {
      s.session.account = id(99)
    },
    (s: ReturnType<typeof readyFixture>) => {
      s.session.memberships[0].player = id(99)
    },
    (s: ReturnType<typeof readyFixture>) => {
      s.snapshot.view.request_id = id(99)
    },
    (s: ReturnType<typeof readyFixture>) => {
      s.snapshot.settings.profile_hash = 'b'.repeat(64)
    },
    (s: ReturnType<typeof readyFixture>) => {
      s.snapshot.settings.speed = 2
    },
    (s: ReturnType<typeof readyFixture>) => {
      s.snapshot.view.viewer_revision = '-1'
    },
  ]) {
    const s = readyFixture()
    mutate(s)
    expect(() => validateInitialGame(s.session, s.snapshot)).toThrow()
  }
})
it('accepts a refreshed universe with a custom active profile name', () => {
  for (const protocol of [3, 4] as const) {
    const { session, snapshot } = readyFixture(protocol)
    Object.assign(snapshot.settings, { profile_id: 'universe-expanded' })
    expect(() => validateInitialGame(session, snapshot)).not.toThrow()
  }
})
