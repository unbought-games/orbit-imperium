import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { components } from '../../contracts'
import { Recruit } from './recruit'
type S = components['schemas']
const summary: S['AllianceSummary'] = {
  id: 'alliance',
  universe: 'u',
  name: 'Starlight',
  tag: 'STAR',
  recruitment: 'Application',
  member_count: 2,
}
const view: S['AllianceView'] = {
  binding: { universe: 'u', epoch: 'e', account: 'a', player: 'p' },
  request_id: 'r',
  sampled_at: 0,
  directory: [],
  directory_count: 0,
  alliance: null,
  applications: [],
}
const member = (id: string): S['AllianceDetail'] => ({
  summary: { ...summary, id },
  revision: 1,
  leader: 'p',
  public_text: '',
  permissions: [],
  grantable_permissions: [],
})
const application = (alliance: string): S['AllianceApplication'] => ({
  id: `application-${alliance}`,
  alliance,
  alliance_tag: 'TAG',
  player: 'p',
  username: 'Pilot',
  text: '',
  created_at: 0,
})
function render(
  overrides: Partial<S['AllianceView']> = {},
  recruitment = summary.recruitment,
  busy = false,
) {
  return renderToStaticMarkup(
    createElement(Recruit, {
      summary: { ...summary, recruitment },
      view: { ...view, ...overrides },
      run: async () => true,
      busy,
    }),
  )
}
it.each([
  [{ alliance: member('alliance') }, 'You’re a member of Starlight.'],
  [{ alliance: member('other') }, 'You already belong to an alliance.'],
  [
    { applications: [application('alliance')] },
    'You have a pending application to this alliance.',
  ],
  [
    {
      applications: Array.from({ length: 5 }, (_, i) => application(String(i))),
    },
    'You have five pending applications.',
  ],
] as const)(
  'membership and pending applications explain why application controls are unavailable: %s',
  (state, message) => {
    const html = render(state)
    expect(html).toContain(message)
    expect(html).not.toContain('<form')
    expect(html).not.toContain('Join STAR')
  },
)
it('closed recruitment has no submission while open recruitment requires review', () => {
  expect(render({}, 'Closed')).toContain('This alliance is not recruiting.')
  expect(render({}, 'Closed')).not.toContain('<button')
  expect(render({}, 'Open')).toContain('Join STAR')
  expect(render({}, 'Open')).not.toContain('Confirm join star')
})
it('an unresolved command disables the entire application form without dropping its fields', () => {
  const html = render({}, 'Application', true)
  expect(html).toContain('<fieldset disabled=""')
  expect(html).toContain('Application message')
  expect(html).toContain('Send application')
})
