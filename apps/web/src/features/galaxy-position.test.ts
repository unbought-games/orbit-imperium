import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { GalaxyDebris, debrisFieldSize } from './galaxy-debris'

it.each([
  ['900', '1500', '900', '1,500'],
  ['0', '400', '0', '400'],
  ['1000000', '9223372036854', '1,000,000', '9,223,372,036,854'],
])(
  'renders whole-unit debris %s / %s with exact accessible values and colored resource marks',
  (metal, crystal, m, c) => {
    const markup = renderToStaticMarkup(
      createElement(GalaxyDebris, {
        debris: { field_identity: 'field', metal, crystal },
        target: '[1:371:2]',
      }),
    )
    for (const full of [m, c]) expect(markup).toContain(`title="${full}"`)
    for (const resource of ['metal', 'crystal']) {
      const name = resource[0].toUpperCase() + resource.slice(1)
      expect(markup).toContain(`aria-label="${name}"`)
      expect(markup).toContain(`color:var(--resource-${resource})`)
    }
    expect(markup).toContain('Debris field')
  },
)

it.each([
  ['0', '300', 'small'],
  ['9999', '0', 'small'],
  ['9999', '1', 'medium'],
  ['499999', '500000', 'medium'],
  ['499999', '500001', 'large'],
  ['9007199254740993', '0', 'large'],
])(
  'selects %s + %s whole units as a %s debris field',
  (metal, crystal, size) => {
    expect(debrisFieldSize(metal, crystal)).toBe(size)
  },
)

it('renders and sizes deuterium-only fields with the canonical accessible mark', () => {
  const markup = renderToStaticMarkup(
    createElement(GalaxyDebris, {
      debris: {
        field_identity: 'field',
        metal: '0',
        crystal: '0',
        deuterium: '1000000',
      },
      target: '[1:371:2]',
      onHarvest: () => {},
    }),
  )
  expect(markup).toContain('Deuterium 1,000,000')
  expect(markup).toContain('color:var(--resource-deuterium)')
  expect(markup).toContain('debris-large.webp')
  expect(debrisFieldSize('100', '100', '9800')).toBe('medium')
})

for (const deuterium of [undefined, '0']) {
  it(`hides ${deuterium ?? 'missing'} debris deuterium in passive and actionable fields`, () => {
    for (const onHarvest of [undefined, () => {}]) {
      const markup = renderToStaticMarkup(
        createElement(GalaxyDebris, {
          debris: {
            field_identity: 'field',
            metal: '0',
            crystal: '400',
            deuterium,
          },
          target: '[1:371:2]',
          onHarvest,
        }),
      )
      expect(markup).not.toMatch(/deuterium/i)
      expect(markup).toContain('aria-label="Metal"')
      expect(markup).toContain('aria-label="Crystal"')
      if (onHarvest) expect(markup).toContain('Metal 0, Crystal 400')
    }
  })
}
