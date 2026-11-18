import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { BuildingFieldSummary } from './building-field-summary'

it('shows occupied fields as a fraction and identifies reservations separately', () => {
  const render = (used: number, reserved: number) =>
    renderToStaticMarkup(
      createElement(BuildingFieldSummary, {
        body: { fields_used: used, fields: 178, fields_reserved: reserved },
      }),
    )
  const active = render(13, 1)
  expect(active).toContain('13/178')
  expect(active).toContain('aria-label="13 of 178 fields used · 1 reserved"')
  const finished = render(14, 0)
  expect(finished).toContain('14/178')
  expect(finished).toContain('aria-label="14 of 178 fields used"')
})
