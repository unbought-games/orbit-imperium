import { describe, it, expect } from 'vitest'
import { acceptSnapshot } from './session'
describe('viewer snapshot binding', () => {
  const base = {
    player: 'alpha',
    universe: 'u',
    epoch: 'e',
    viewer_revision: '9007199254740993',
    as_of_ms: 100,
  }
  it('does not roll back large revisions or same-revision sample time', () => {
    expect(
      acceptSnapshot(
        base,
        { ...base, viewer_revision: '9007199254740992' },
        base,
      ),
    ).toBe(false)
    expect(acceptSnapshot(base, { ...base, as_of_ms: 99 }, base)).toBe(false)
    expect(acceptSnapshot(base, { ...base, as_of_ms: 101 }, base)).toBe(true)
  })
  it('discards responses from previous account and opaque epochs', () => {
    expect(acceptSnapshot(null, { ...base, player: 'beta' }, base)).toBe(false)
    expect(acceptSnapshot(base, { ...base, epoch: 'z' }, base)).toBe(false)
  })
})

it('rejects a wrong-principal initial snapshot and reset candidate', async () => {
  const { snapshotDecision, belongsToMembership } = await import('./session')
  const membership = { player: 'alpha', universe: 'u' }
  const incoming = {
    ...membership,
    epoch: 'e',
    viewer_revision: '0',
    as_of_ms: 100,
  }
  expect(
    snapshotDecision(null, { ...incoming, player: 'beta' }, membership),
  ).toBe('ignored')
  expect(snapshotDecision(null, incoming, membership)).toBe('accepted')
  expect(
    snapshotDecision(incoming, { ...incoming, epoch: 'new' }, membership),
  ).toBe('epochChanged')
  expect(belongsToMembership(incoming, { player: 'beta', universe: 'u' })).toBe(
    false,
  )
})
