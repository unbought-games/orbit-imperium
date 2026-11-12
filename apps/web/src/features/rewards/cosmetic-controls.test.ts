import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CosmeticColor } from './cosmetic-controls'

it.each([false, true])(
  'associates disabled color guidance with the control (named dyes: %s)',
  (named) => {
    const html = renderToStaticMarkup(
      createElement(CosmeticColor, {
        snapshot: {
          dyes: named
            ? [
                {
                  id: 'sample-blue',
                  name: 'Sample blue',
                  color: '#123456',
                  tier: 'standard',
                  scope: 'account',
                  access: 'free',
                  availability: 'available',
                },
              ]
            : [],
        },
        label: 'Accent color',
        value: named ? 'dye:sample-blue' : '#123456',
        disabled: true,
        description: 'Select an element to set its color.',
        onChange: () => {},
      }),
    )
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeTruthy()
    expect(html).toContain(
      `id="${descriptionId}">Select an element to set its color.</small>`,
    )
    expect(html).toContain('aria-label="Accent color"')
  },
)
