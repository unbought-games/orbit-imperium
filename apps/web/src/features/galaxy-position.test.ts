import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { colonizationStatus } from '../client-model/colonization'
import { GalaxyPosition } from './galaxy-position'

it.each([
  ['900', '1500', '900', '1,500'],
  ['0', '400', '0', '400'],
  ['1000000', '9223372036854', '1,000,000', '9,223,372,036,854'],
])(
  'renders Galaxy API debris %s / %s as whole resources with accessible icons',
  (metal, crystal, metalDisplay, crystalDisplay) => {
    const markup = renderToStaticMarkup(
      createElement(GalaxyPosition, {
        position: {
          coordinates: { galaxy: 1, system: 1, position: 4 },
          body: null,
          // PublicDebris contains whole units, unlike report Resources.
          debris: { field_identity: 'field', metal, crystal },
        },
        player: 'viewer',
        origin: 'origin',
        canAttack: true,
        colony: colonizationStatus(null, 4),
        onDraft: () => {},
      }),
    )
    expect(markup.replace(/<[^>]+>/g, '')).toContain(
      `Debris field${metalDisplay}${crystalDisplay}`,
    )
    for (const resource of ['metal', 'crystal']) {
      const title = resource[0].toUpperCase() + resource.slice(1)
      expect(markup).toContain(`title="${title}"`)
      expect(markup).toContain(`aria-label="${title}"`)
      expect(markup).toContain(`color:var(--resource-${resource})`)
    }
  },
)
