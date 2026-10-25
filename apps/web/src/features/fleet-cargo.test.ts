import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { FleetCargo } from './fleet-cargo'

it('formats current micro-resources exactly with accessible resource identities', () => {
  const markup = renderToStaticMarkup(
    createElement(FleetCargo, {
      cargo: {
        metal: '9223372036854775807',
        crystal: '2500999',
        deuterium: '7000000',
      },
    }),
  )
  expect(markup).toContain('9,223,372,036,854')
  expect(markup).toContain('<span>2</span>')
  expect(markup).toContain('<span>7</span>')
  for (const name of ['Metal', 'Crystal', 'Deuterium']) {
    expect(markup).toContain(`aria-label="${name}"`)
    expect(markup).toContain(`title="${name}"`)
    expect(markup).toContain(`color:var(--resource-${name.toLowerCase()})`)
  }
})

it('distinguishes empty cargo from unavailable cargo', () => {
  const empty = renderToStaticMarkup(
    createElement(FleetCargo, {
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
    }),
  )
  expect(empty.match(/<span>0<\/span>/g)).toHaveLength(3)
  expect(empty).not.toContain('Unavailable')
  for (const cargo of [undefined, null]) {
    const unavailable = renderToStaticMarkup(
      createElement(FleetCargo, { cargo }),
    )
    expect(unavailable).toContain('Unavailable')
    expect(unavailable).not.toContain('data-resource')
  }
})
