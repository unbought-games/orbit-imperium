import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ScreenContext } from '../shell/screen-context'
import { useGameSession } from '../shell/session-context'
import type { Page } from '../shell/routes'
import { empireFixture } from '../test-support/empire'
import { PreparedLinkContext } from '../test-support/prepared-link-context'
import { EconomyScreen, ResourceSettingsScreen } from './game-screens'
import { progressionFixture } from './progression/progression-test-fixture'

function FundedScreen({ page, bodyId }: { page: Page; bodyId: string }) {
  const session = useGameSession()
  const body = session.view.bodies.find((candidate) => candidate.id === bodyId)
  if (!body) throw Error('Missing selected fixture body')
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
    // The universe enables these technologies on planets. The selected moon's
    // restriction must still be visible when the relevant catalog is populated.
    const profile = new URL(
      '../../../../rules/mvp-v1-slice-13.json',
      import.meta.url,
    )
    view.catalog = JSON.parse(readFileSync(profile, 'utf8')).catalog
    const planet = view.bodies[0]
    view.progression.production = [
      { ...empireFixture(1000).production[0], body: planet.id },
    ]
    view.bodies = [
      planet,
      {
        ...planet,
        id: 'moon',
        kind: 'Moon',
        moon: { parent: planet.id, created_at: 1000 },
      },
    ]
    const render = (bodyId: string) =>
      renderToStaticMarkup(
        createElement(PreparedLinkContext, {
          view,
          children: createElement(FundedScreen, { page, bodyId }),
        }),
      )
    expect(render('moon')).toContain(message)
    expect(render(planet.id)).not.toContain(message)
  },
)
