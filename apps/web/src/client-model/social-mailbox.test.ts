import { expect, it } from 'vitest'
import { acceptMailboxAction, readMailbox } from './social-mailbox'
import { emptySocialView } from './social'
const contact = {
  player: 'peer',
  username: 'Nova',
  blocked: false,
  request: null,
  requested_by: null,
  accepted: false,
}
const latest = {
  id: 'message',
  sequence: '10',
  sender: 'peer',
  body: 'Hello',
  sent_at: 10,
}
const mailbox = {
  conversations: [{ contact, latest, unread: true }],
  circulars: [],
}
it('does not clear newer mail when an older message was read; successful latest reads clear it', () => {
  expect(
    acceptMailboxAction(mailbox, {
      type: 'Read',
      player: 'peer',
      message: 'older',
    })?.conversations[0].unread,
  ).toBe(true)
  expect(
    acceptMailboxAction(mailbox, {
      type: 'Read',
      player: 'peer',
      message: 'message',
    })?.conversations[0].unread,
  ).toBe(false)
})
it('fetches unread conversations beyond the first page and rejects broken cursors', async () => {
  const base = {
    ...emptySocialView(),
    binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
    request_id: 'request',
  }
  const result = await readMailbox(async (q) =>
    q.type === 'Conversations'
      ? {
          ...base,
          conversations: q.cursor ? mailbox.conversations : [],
          next_cursor: q.cursor ? null : 'next',
        }
      : base,
  )
  expect(result.conversations).toHaveLength(1)
  await expect(
    readMailbox(async () => ({ ...base, next_cursor: 'loop' })),
  ).rejects.toThrow('pagination')
})

it('keeps circulars available when an older server rejects application notices', async () => {
  const base = {
    ...emptySocialView(),
    binding: { account: 'a', player: 'p', universe: 'u', epoch: 'e' },
    request_id: 'r',
  }
  const queries: string[] = []
  const inbox = await readMailbox(async (query) => {
    if (query.type === 'Circulars') {
      queries.push(query.include_application_notices ? 'notices' : 'legacy')
      if (query.include_application_notices) throw { code: 'Malformed' }
    }
    return base
  })
  expect(queries).toEqual(['notices', 'legacy'])
  expect(inbox.applicationNotices).toEqual([])
})
