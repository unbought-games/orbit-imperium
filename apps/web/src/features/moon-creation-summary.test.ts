import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { MoonCreationSummary } from './moon-creation-summary'
import { reportPreview } from './report-preview'

const render = (value: unknown) =>
  renderToStaticMarkup(createElement(MoonCreationSummary, { value }))

it('shows failed creation, successful creation and shared outcomes without internal IDs', () => {
  expect(render(undefined)).toBe('')
  const failed = render({ chance_percent: 20 })
  expect(failed).toContain('20% chance')
  expect(failed).toContain('No moon formed')
  for (const moon of [undefined, 'moon-id']) {
    const created = render({ chance_percent: 20, diameter_km: 8366, moon })
    expect(created).toContain('Moon created')
    expect(created).toContain('8,366 km')
    expect(created).toContain('debris remains available')
  }
})

it('keeps a creation notice linked to the moon at the shared coordinates', () => {
  const at = { galaxy: 1, system: 2, position: 3 }
  expect(
    reportPreview({ kind: 'MoonCreated', coordinates: at, diameter_km: 8366 }),
  ).toEqual({
    location: 'Moon · [1:2:3]',
    coordinates: at,
    targetKind: 'moon',
    facts: ['8,366 km diameter'],
  })
})
