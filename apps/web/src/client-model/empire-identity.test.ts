import { describe, expect, it } from 'vitest'
import {
  addressCaption,
  defaultTitle,
  effectiveTitle,
  identityError,
} from './empire-identity'
describe('empire identity', () => {
  it('expires supporter forms of address at their boundary without changing permanent titles', () => {
    const title = {
      id: 'fixture',
      label: 'Fixture',
      address: 'Esteemed fixture',
      expires_at: 100,
    }
    expect(effectiveTitle(title, 99_999)).toBe(title)
    expect(effectiveTitle(title, 100_000)).toBe(defaultTitle)
    expect(effectiveTitle({ ...title, expires_at: null }, 100_001).id).toBe(
      'fixture',
    )
    expect(effectiveTitle(undefined, 0)).toBe(defaultTitle)
  })
  it('counts Unicode characters and rejects controls without rejecting plain text punctuation', () => {
    const identity = {
      name: '星'.repeat(60),
      tagline: 'é'.repeat(160),
      title_id: 'consul',
    }
    expect(identityError(identity)).toBe('')
    expect(identityError({ ...identity, name: identity.name + 'x' })).toContain(
      '60',
    )
    expect(
      identityError({ ...identity, tagline: identity.tagline + 'x' }),
    ).toContain('160')
    expect(identityError({ ...identity, name: '\u202ehidden' })).toContain(
      'control',
    )
    expect(identityError({ ...identity, name: '<Roman> & Empire' })).toBe('')
  })
  it('addresses the player with the catalog form of address', () => {
    expect(addressCaption('Systems Online', 'Consul')).toBe('Welcome, Consul.')
    expect(addressCaption('Updated', 'Consul')).toBe('Updated')
    expect(addressCaption('Research complete.', 'Consul')).toBe(
      'Consul, research complete.',
    )
  })
})
