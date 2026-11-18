import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { AverageGrossHaul } from './average-gross-haul'

it('keeps fractional resource averages visible so the haul rows add up to the total', () => {
  const html = renderToStaticMarkup(
    createElement(AverageGrossHaul, {
      loot: [
        { resource: 'metal', average: 1_000_200_000n },
        { resource: 'crystal', average: 500_000n },
        { resource: 'deuterium', average: 300_000n },
      ],
      total: 1_001_000_000n,
    }),
  )
  expect(html.replace(/<[^>]+>/g, '')).toBe(
    'Average gross haulMetal1,000.2Crystal0.5Deuterium0.3Total1,001',
  )
})
