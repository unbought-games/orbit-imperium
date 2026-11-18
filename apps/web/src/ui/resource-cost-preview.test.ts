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
      compactCaption: { summary: 'Next level costs 299,273 Metal' },
    }),
  )
  expect(html).toContain('aria-describedby=')
  expect(html).toMatch(
    /Next level costs 299,273 Metal<span[^>]*>Not enough resources<\/span>/,
  )
})
