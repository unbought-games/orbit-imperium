import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { reportPreview } from './report-preview'
import { ReportPreviewFacts } from './report-preview-facts'
import type { components } from '../contracts'

const cargo = {
  metal: '10713000000',
  crystal: '8238000000',
  deuterium: '2608000000',
}
it.each([
  [
    'collected',
    { metal: '713000000', crystal: '238000000', deuterium: '608000000' },
    'Harvested:713238608',
    ['metal', 'crystal', 'deuterium'],
  ],
  [
    'zero',
    { metal: '0', crystal: '0', deuterium: '0' },
    'Harvested:00',
    ['metal', 'crystal'],
  ],
  ['legacy', undefined, 'Harvested amount unavailable', []],
] as const)(
  'harvest row renders %s facts without presenting carried cargo as a collection',
  (_, harvested, text, resources) => {
    const preview: components['schemas']['ReportPreview4'] = {
      kind: 'Harvested',
      cargo,
      ...(harvested ? { harvested } : {}),
    }
    const markup = renderToStaticMarkup(
      createElement(ReportPreviewFacts, {
        facts: reportPreview(preview).facts,
      }),
    )
    expect(markup.replace(/<[^>]+>/g, '')).toBe(text)
    expect(markup).not.toMatch(/10,713|8,238|2,608/)
    expect(markup.match(/<svg[^>]+data-resource=/g) ?? []).toHaveLength(
      resources.length,
    )
    for (const resource of resources) {
      expect(markup).toContain(`title="${resource}"`)
      expect(markup).toContain(`aria-label="${resource}"`)
      expect(markup).toContain(`data-resource="${resource}"`)
      expect(markup).toContain(`color:var(--resource-${resource})`)
    }
  },
)

it('renders no empty preview container and separates recorded facts accessibly', () => {
  expect(
    renderToStaticMarkup(createElement(ReportPreviewFacts, { facts: [] })),
  ).toBe('')
  const markup = renderToStaticMarkup(
    createElement(ReportPreviewFacts, {
      facts: ['One Recycler', 'Resources unknown'],
    }),
  )
  expect(markup.replace(/<[^>]+>/g, '')).toBe('One Recycler·Resources unknown')
  expect(markup).toContain('aria-hidden="true">·</span>')
})
