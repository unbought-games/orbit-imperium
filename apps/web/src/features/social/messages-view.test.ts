import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import {
  SocialController,
  emptySocialView,
  type SocialView,
} from '../../client-model/social'
import { MessagesView } from './messages-view'
const history: SocialView = {
  binding: { universe: 'u', epoch: 'e', account: 'a', player: 'self' },
  request_id: 'r',
  ...emptySocialView(),
  contact: {
    player: 'peer',
    username: 'Nova',
    blocked: false,
    request: null,
    requested_by: null,
    accepted: false,
  },
}
function render(
  patch: Partial<ReturnType<SocialController['store']['getState']>>,
) {
  const controller = new SocialController({
    newId: () => 'id',
    command: async () => null,
    read: async () => null,
  })
  return renderToStaticMarkup(
    createElement(MessagesView, {
      controller,
      state: { ...controller.store.getState(), ...patch },
      self: 'self',
      player: 'peer',
      tab: 'Conversations',
      select: () => {},
      changeTab: () => {},
    }),
  )
}
it('initial history loading has a status while a pending refresh retains the empty conversation and composer', () => {
  expect(render({ historyRequest: 'latest' })).toContain('Loading messages…')
  const html = render({ history, historyRequest: 'newer' })
  expect(html).toContain('Start your conversation.')
  expect(html).toContain('Send message')
  expect(html).not.toContain('Loading messages…')
})
it('a background error keeps delivered history and offers an explicit retry', () => {
  const html = render({ history, error: 'History unavailable' })
  expect(html).toContain('role="alert"')
  expect(html).toContain('History unavailable')
  expect(html).toContain('Retry messages')
  expect(html).toContain('Send message')
})
it('blocked history replaces the composer with an explanation', () => {
  const html = render({
    history: { ...history, contact: { ...history.contact!, blocked: true } },
  })
  expect(html).toContain(
    'This player is blocked. Unblock them to send messages.',
  )
  expect(html).not.toContain('aria-label="Send message"')
})
