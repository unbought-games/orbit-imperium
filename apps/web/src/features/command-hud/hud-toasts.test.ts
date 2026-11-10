import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { HudToasts } from './hud-toasts'
import type { HudToastView } from './notification-history'

const notice = (id: string): HudToastView => ({
  target: { kind: 'command', id },
  content: {
    title: `Probe ${id}`,
    detail: 'Espionage · [1:2:3]',
    tone: 'ice',
    icon: 'spy',
  },
  now: 1000,
  freeFleetSlots: '3',
})
const render = (notices: HudToastView[]) =>
  renderToStaticMarkup(
    createElement(HudToasts, {
      notices,
      onOpen: () => {},
      onDismiss: () => {},
    }),
  )
it('renders one accessible top card and hides covered cards without app providers', () => {
  const html = render([notice('newest'), notice('middle'), notice('oldest')])
  expect(html).toContain(
    'aria-label="Recent game events" aria-live="polite" aria-relevant="additions"',
  )
  expect(html).toMatch(/data-toast-depth="0" style=/)
  expect(html).toMatch(/data-toast-depth="1" inert="" aria-hidden="true"/)
  expect(html).toMatch(/data-toast-depth="2" inert="" aria-hidden="true"/)
  expect(html.indexOf('Probe newest')).toBeLessThan(
    html.indexOf('Probe oldest'),
  )
  expect(html).toContain('3 fleet slots available')
})
it('renders prepared deadline and canonical resource names without inventing absent timing', () => {
  const card = notice('launch')
  const untimed = render([card])
  expect(untimed).not.toContain('<time')
  card.content.deadline = 61000
  card.content.costs = {
    metal: '1000000',
    crystal: '2000000',
    deuterium: '3000000',
  }
  const timed = render([card])
  expect(timed).toContain('dateTime="1970-01-01T00:01:01.000Z"')
  for (const name of ['Metal', 'Crystal', 'Deuterium'])
    expect(timed).toContain(`aria-label="${name}"`)
})
