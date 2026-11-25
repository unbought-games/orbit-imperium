import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import type { InsigniaRecipe } from '../adapters/insignias'
import { EmpireInsignia } from './empire-insignia'

function renderInsignia(shape: InsigniaRecipe['shape']) {
  return renderToStaticMarkup(
    createElement(EmpireInsignia, {
      appearance: {
        asset_url: '/api/media/insignias/compass/wayfinder.svg',
        recipe: {
          version: 2,
          symbol: 'compass',
          foreground: '#cbb68d',
          background: '#152b40',
          shape,
        },
      },
    }),
  )
}

test.each([
  ['diamond', '50,0 100,50 50,100 0,50', '50% 0%, 100% 50%, 50% 100%, 0% 50%'],
  [
    'hexagon',
    '25,0 75,0 100,50 75,100 25,100 0,50',
    '25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%',
  ],
] as const)('%s outlines its own clipped silhouette', (shape, points, clip) => {
  const markup = renderInsignia(shape)
  expect(markup).toContain(`clip-path:polygon(${clip})`)
  expect(markup).toContain(
    `points="${points}" vector-effect="non-scaling-stroke"`,
  )
})

test.each(['shield', 'circle', 'rounded_square', undefined] as const)(
  '%s retains the ordinary border treatment',
  (shape) => {
    const markup = renderInsignia(shape)
    expect(markup).toContain(`data-shape="${shape ?? 'shield'}"`)
    expect(markup).not.toContain('<polygon')
  },
)
