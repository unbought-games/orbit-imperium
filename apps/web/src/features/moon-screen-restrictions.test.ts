import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ScreenContext } from '../shell/screen-context'
import { useGameSession } from '../shell/session-context'
import type { Page } from '../shell/routes'
import { PreparedLinkContext } from '../test-support/prepared-link-context'
import { EconomyScreen, ResourceSettingsScreen } from './game-screens'
import { progressionFixture } from './progression/progression-test-fixture'

function MoonScreen({ page }: { page: Page }) {
  const session = useGameSession()
  const body = session.view.bodies[0]
  return createElement(
    ScreenContext.Provider,
    {
      value: {
        ...session,
        body,
        route: { page, body: body.id, item: null, available: true, reason: '' },
        prepareDispatch() {
          throw Error('Unexpected dispatch')
        },
      },
    },
    createElement(
      page === 'resource-settings' ? ResourceSettingsScreen : EconomyScreen,
    ),
  )
}

const cases = [
  [
    'resources',
    'Moons have no resource production. Storage construction on moons is not available yet.',
  ],
  ['resource-settings', 'Moons have no resource production.'],
  ['research', 'Research cannot be conducted on moons.'],
  ['shipyard', 'Manufacturing on moons is not available yet.'],
  ['defense', 'Manufacturing on moons is not available yet.'],
] as const

it.each(cases)(
  'shows the lunar restriction on the %s screen',
  (page, message) => {
    const { view } = progressionFixture()
    const planet = view.bodies[0]
    view.bodies = [
      {
        ...planet,
        id: 'moon',
        kind: 'Moon',
        moon: { parent: planet.id, created_at: 1000 },
      },
      planet,
    ]
    const html = renderToStaticMarkup(
      createElement(PreparedLinkContext, {
        view,
        children: createElement(MoonScreen, { page }),
      }),
    )
    expect(html).toContain(message)
  },
)
