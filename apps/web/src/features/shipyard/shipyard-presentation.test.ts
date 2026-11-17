import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { ShipyardDetailLayout } from './shipyard-detail-layout'
import { ShipyardSelectionRail } from './shipyard-selection-rail'
import type { components } from '../../contracts'
import { catalogContent } from '../progression/catalog-content'
import type { CatalogSelection } from '../../shell/use-catalog-selection'

const selection: CatalogSelection = {
  selectedId: 'LightFighter',
  close: vi.fn(),
  back: {
    href: '/u/test/b/planet/shipyard',
    'aria-label': 'Back to Shipyard',
    onClick: vi.fn(),
  },
  link: (id) => ({
    href: `/u/test/b/planet/shipyard/${id}`,
    'data-catalog-item': id,
    onClick: vi.fn(),
  }),
}

it('keeps military and civil ships reachable with canonical links and exposes the selected craft', () => {
  const entries: components['schemas']['CatalogEntry3'][] = [
    'LightFighter',
    'SmallCargo',
  ].map((id) => ({
    key: { kind: 'Ship', id: id as 'LightFighter' | 'SmallCargo' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: true,
  }))
  const html = renderToStaticMarkup(
    createElement(ShipyardSelectionRail, {
      entries,
      selection,
      count: () => '7',
      status: (entry) =>
        entry.key.id === 'LightFighter' ? 'Requirements needed' : '',
    }),
  )
  expect(html).toContain('Military ships')
  expect(html).toContain('Civil ships')
  expect(html).toContain('href="/u/test/b/planet/shipyard/LightFighter"')
  expect(html).toContain('href="/u/test/b/planet/shipyard/SmallCargo"')
  expect(html).toContain('aria-current="page" aria-label="Build Light Fighter"')
  expect(html).toContain('Requirements needed')
  expect(html).toContain('7 stationed')
})

it('preserves the order content and terms, with Customize only when supplied', () => {
  const props = {
    content: catalogContent({ kind: 'Ship', id: 'LightFighter' }),
    back: selection.back,
    children: createElement('button', { 'aria-label': 'Build' }, 'Order 5'),
    footer: createElement('p', null, 'Order terms'),
    artwork: createElement('img', { src: '/ship.webp', alt: '' }),
  }
  const supported = renderToStaticMarkup(
    createElement(ShipyardDetailLayout, { ...props, customize: vi.fn() }),
  )
  const unsupported = renderToStaticMarkup(
    createElement(ShipyardDetailLayout, props),
  )
  expect(supported).toContain('Customize')
  expect(supported).toContain('aria-label="Build"')
  expect(supported).toContain('Order 5')
  expect(supported).toContain('Order terms')
  expect(supported).toContain('/ship.webp')
  expect(unsupported).not.toContain('Customize')
})
