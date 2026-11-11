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
  it('uses the catalog form of address only where copy addresses the player', () => {
    expect(addressCaption('Welcome, {address}.', 'Consul')).toBe(
      'Welcome, Consul.',
    )
    expect(addressCaption('Welcome back, {address}.', 'Consul')).toBe(
      'Welcome back, Consul.',
    )
    expect(addressCaption('Ready when you are, {address}.', 'Navigator')).toBe(
      'Ready when you are, Navigator.',
    )
    // Catalog text is literal, including replacement-pattern characters.
    expect(addressCaption('Welcome, {address}.', '$& Navigator')).toBe(
      'Welcome, $& Navigator.',
    )
  })
  it('preserves general updates and asides without a title or case changes', () => {
    for (const text of [
      'Updated',
      'Refreshed',
      'Research complete.',
      'Connection lost.',
      'Champagne means unread.',
      'Whoops.',
      'Good thing we sent the bad one.',
    ]) {
      expect(addressCaption(text, 'Consul')).toBe(text)
    }
  })
})
