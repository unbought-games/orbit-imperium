import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ResourceMark } from './resource-mark'

it.each(['metal', 'crystal', 'deuterium', 'energy'] as const)(
  '%s owns its canonical color even with caller styling',
  (resource) => {
    const markup = renderToStaticMarkup(
      createElement(ResourceMark, {
        resource,
        style: { color: 'red', width: 24 },
      }),
    )
    expect(markup).toContain(
      `color:var(--${resource === 'energy' ? 'ice' : `resource-${resource}`})`,
    )
    expect(markup).not.toContain('color:red')
    expect(markup).toContain('width:24px')
  },
)
