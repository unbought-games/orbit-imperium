import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { DispatchTiming } from './dispatch-timing'

const now = new Date(2026, 11, 31, 23, 59, 30).getTime()
const terms = { duration_ms: 100000, fuel: '1000000' }
const format = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})

it('shows a local deployment arrival across midnight and year boundaries instead of a duplicate total', () => {
  const arrival = now + terms.duration_ms
  const markup = renderToStaticMarkup(
    createElement(DispatchTiming, { mission: 'Deploy', terms, now }),
  )
  expect(markup).toContain('<dt>To destination</dt>')
  expect(markup).toContain('1m 40s')
  expect(markup).toContain('<dt>Arrives at</dt>')
  expect(markup).toContain(`dateTime="${new Date(arrival).toISOString()}"`)
  expect(markup).toContain(`>${format.format(arrival)}</time>`)
  expect(markup).not.toContain('Total flight')
  expect(markup).not.toContain('Back at')
  expect(markup).toContain('Deuterium consumed')
})

it.each([
  'Updating flight times…',
  'Select ships to see flight times.',
  'Destination unavailable.',
])('omits timestamps when deployment terms are absent: %s', (message) => {
  const markup = renderToStaticMarkup(
    createElement(DispatchTiming, { mission: 'Deploy', now, message }),
  )
  expect(markup).not.toContain('<time')
  expect(markup).toContain('<dt>Arrives at</dt><dd>—</dd>')
  expect(markup).toContain(message)
})

it.each([
  'Attack',
  'Transport',
  'Harvest',
  'Espionage',
  'Colonize',
  'Hold',
] as const)(
  'preserves %s return timing, conditional wording and holding duration',
  (mission) => {
    const holdingMs = 3600000
    const total = 2 * terms.duration_ms + (mission === 'Hold' ? holdingMs : 0)
    const markup = renderToStaticMarkup(
      createElement(DispatchTiming, { mission, terms, now, holdingMs }),
    )
    expect(markup).toContain(
      `<dt>${mission === 'Colonize' ? 'Back if needed' : 'Back at'}</dt>`,
    )
    expect(markup).toContain(
      `dateTime="${new Date(now + total).toISOString()}"`,
    )
    expect(markup).toContain(
      `<dt>${mission === 'Hold' ? 'Total mission' : 'Total flight'}</dt><dd>${mission === 'Hold' ? '1h 3m 20s' : '3m 20s'}</dd>`,
    )
    expect(markup).not.toContain('Arrives at')
  },
)
