import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { InvitationView } from './invitation-entry'

it('offers a fresh link instead of a signup destination for an unbound invitation', () => {
  const markup = renderToStaticMarkup(
    createElement(InvitationView, {
      code: 'older',
      authenticated: false,
      entry: {
        preview: {
          code: 'older',
          status: 'unavailable',
          kind: 'personal',
          alliance: null,
          inviter: null,
          universe: null,
        },
        loading: false,
        busy: false,
        error: '',
        enter: async () => {},
        retry: () => {},
      },
    }),
  )
  expect(markup).toContain('Ask your friend for a fresh link')
  expect(markup).toContain('Explore Orbit Imperium')
  expect(markup).not.toContain('Join this universe')
  expect(markup).not.toContain('/api/auth/login')
})
