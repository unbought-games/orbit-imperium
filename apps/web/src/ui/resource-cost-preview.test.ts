import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ImageTile } from './image-catalog'
import { ResourceCostPreview } from './resource-costs'

it('pairs rounded prices with the exact named materials and omits free materials', () => {
  const cost = { metal: '299273000000', crystal: '0', deuterium: '324000000' }
  const html = renderToStaticMarkup(
    createElement(ResourceCostPreview, { cost }),
  )
  expect(html).toContain('Next level costs')
  expect(html).toContain('title="299,273 Metal"')
  expect(html).toContain('>300K<')
  expect(html).not.toContain('crystal')
  expect(html).toContain('title="324 Deuterium"')
  expect(html).toContain('>324<')
})

it('keeps the affordability status in the compact caption used as the link description', () => {
  const html = renderToStaticMarkup(
    createElement(ImageTile, {
      title: 'Metal Mine',
      level: 21,
      href: '/mine',
      art: { src: '/mine.webp' },
      unaffordable: true,
      compactCaption: true,
      summary: 'Next level costs 299,273 Metal',
    }),
  )
  expect(html).toContain('aria-describedby=')
  expect(html).toMatch(
    /Next level costs 299,273 Metal<span[^>]*>Not enough resources<\/span>/,
  )
})

it('labels additional energy draw separately from the material price', () => {
  const html = renderToStaticMarkup(
    createElement(ResourceCostPreview, {
      cost: { metal: '60000000', crystal: '0', deuterium: '0' },
      energyDemand: 13200000n,
    }),
  )
  expect(html).toContain('title="60 Metal"')
  expect(html).toContain('title="Next level draws 13 more energy"')
  expect(html).toContain('data-resource="energy"')
  expect(html).toContain('>13<')
})

it('shows sub-unit draw beside an active upgrade without adding a price', () => {
  const html = renderToStaticMarkup(
    createElement(ResourceCostPreview, { cost: null, energyDemand: 500000n }),
  )
  expect(html).toContain('title="Next level draws less than 1 more energy"')
  expect(html).toContain('>&lt;1<')
  expect(html).not.toContain('Next level costs')
})
