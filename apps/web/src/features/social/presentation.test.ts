import { describe, expect, it } from 'vitest'
import {
  defaultConversationOptions,
  sameMessageDay,
  visibleConversations,
} from './presentation'
import type { SocialView } from '../../client-model/social'
const conversations: SocialView['conversations'] = [
  {
    contact: {
      player: 'b',
      username: 'Nova',
      blocked: false,
      request: null,
      requested_by: null,
      accepted: false,
    },
    latest: {
      id: 'm2',
      sequence: '22',
      sender: 'b',
      body: 'Meet at the outpost',
      sent_at: 2000,
    },
    unread: true,
  },
  {
    contact: {
      player: 'a',
      username: 'Atlas',
      blocked: false,
      request: null,
      requested_by: null,
      accepted: false,
    },
    latest: {
      id: 'm1',
      sequence: '10',
      sender: 'self',
      body: 'Cargo is on its way',
      sent_at: 1000,
    },
    unread: false,
  },
]
describe('conversation presentation', () => {
  it('searches names and previews without mutating the source', () => {
    expect(
      visibleConversations(
        conversations,
        {},
        { ...defaultConversationOptions, search: '  ATLAS ' },
      ),
    ).toEqual([conversations[1]])
    expect(
      visibleConversations(
        conversations,
        {},
        { ...defaultConversationOptions, search: 'OUTPOST' },
      ),
    ).toEqual([conversations[0]])
    expect(
      visibleConversations(
        conversations,
        {},
        { ...defaultConversationOptions, search: 'missing' },
      ),
    ).toEqual([])
    expect(conversations[0].contact.player).toBe('b')
  })
  it('filters unread against confirmed read positions', () => {
    const options = { ...defaultConversationOptions, unread: true }
    expect(visibleConversations(conversations, {}, options)).toEqual([
      conversations[0],
    ])
    expect(visibleConversations(conversations, { b: '22' }, options)).toEqual(
      [],
    )
    expect(visibleConversations(conversations, { b: '21' }, options)).toEqual([
      conversations[0],
    ])
  })
  it('sorts newest, oldest and by player name', () => {
    expect(
      visibleConversations(conversations, {}, defaultConversationOptions),
    ).toEqual(conversations)
    for (const sort of ['oldest', 'name'] as const)
      expect(
        visibleConversations(
          conversations,
          {},
          { ...defaultConversationOptions, sort },
        ),
      ).toEqual([...conversations].reverse())
  })
  it('separates local calendar days, including year changes', () => {
    expect(
      sameMessageDay(
        new Date(2026, 9, 30, 10).getTime(),
        new Date(2026, 9, 30, 23).getTime(),
      ),
    ).toBe(true)
    expect(
      sameMessageDay(
        new Date(2026, 9, 30, 23).getTime(),
        new Date(2026, 9, 31, 0).getTime(),
      ),
    ).toBe(false)
    expect(
      sameMessageDay(
        new Date(2025, 9, 30).getTime(),
        new Date(2026, 9, 30).getTime(),
      ),
    ).toBe(false)
  })
})
