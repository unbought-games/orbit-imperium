import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { SupporterIdentity } from './supporter-identity'

it.each([
  [1, '$10 / month'],
  [2, '$25 / month'],
  [3, '$100 / month'],
] as const)(
  'tier %s exposes its supporter label and palette selector',
  (tier, label) => {
    const markup = renderToStaticMarkup(
      createElement(SupporterIdentity, { name: 'Commander', tier }),
    )
    expect(markup).toContain(`data-tier="${tier}"`)
    expect(markup).toContain('data-palette="starlight"')
    expect(markup).toContain('role="img"')
    expect(markup).toContain(`aria-label="Supporter · ${label} USD"`)
    expect(markup).toContain(`title="Supporter · ${label} USD"`)
  },
)

it('an ordinary identity has no supporter badge or tier styling selector', () => {
  const markup = renderToStaticMarkup(
    createElement(SupporterIdentity, { name: 'Commander' }),
  )
  expect(markup.replace(/<[^>]*>/g, '')).toBe('Commander')
  expect(markup).not.toContain('role="img"')
  expect(markup).not.toContain('Supporter')
  expect(markup).not.toContain('data-tier')
})
