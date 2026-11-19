import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { PreparedLinkContext } from '../test-support/prepared-link-context'
import {
  fleetPresentationFixture,
  fleetFixtureTime,
} from '../test-support/fleet-presentation'
import { id } from '../test-support/bootstrap'
import { WorkSummaries } from './work-summaries'
import type { Page } from '../shell/routes'

it.each([null, 'MetalMine', 'ResearchLab'] as const)(
  'keeps summary destinations contextual during %s construction',
  (building) => {
    const { view, body } = fleetPresentationFixture()
    view.capabilities = [
      { capability: 'Manufacturing', enabled: true, reason: 'Available' },
    ]
    const paid = { metal: '60000000', crystal: '15000000', deuterium: '0' }
    view.constructions = building
      ? [
          {
            id: id(20),
            body: body.id,
            building,
            target_level: 2,
            due_at: fleetFixtureTime + 76000,
            paid,
          },
        ]
      : []
    view.progression.research_operation = building
      ? {
          id: id(21),
          host: body.id,
          research: 'EnergyTechnology',
          source_level: 0,
          target_level: 1,
          paid,
          started_at: fleetFixtureTime,
          due_at: fleetFixtureTime + 76000,
          labs: [],
          effective_lab: '1',
          can_cancel: true,
        }
      : null
    const base = `/u/andromeda-prime/b/${body.id}`
    const render = (
      currentPage: Page,
      only: 'buildings' | 'research' | 'manufacturing',
    ) =>
      renderToStaticMarkup(
        createElement(PreparedLinkContext, {
          view,
          children: createElement(WorkSummaries, {
            view,
            body,
            currentPage,
            only,
            layout: 'compact',
          }),
        }),
      )
    for (const currentPage of ['resources', 'facilities'] as const) {
      const html = render(currentPage, 'buildings')
      const links = [
        ...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>\s*Open ([^<]+)</g),
      ].map((m) => [m[1], m[2].trim()])
      expect(links).toEqual(
        currentPage === 'facilities' && building === 'MetalMine'
          ? [[base + '/resources', 'resources']]
          : [],
      )
    }
    const research = render('research', 'research')
    if (building) {
      expect(research).toContain(
        'href="' + base + '/research/energy-technology"',
      )
      expect(research).toContain('Energy Technology')
      expect(research).toContain('Level 1')
      expect(research).toContain('Cancel research')
    } else expect(research).toContain('No research in progress.')
    for (const page of ['shipyard', 'defense'] as const) {
      const links = render(page, 'manufacturing')
      const other = page === 'shipyard' ? 'defense' : 'shipyard'
      expect(links).toContain('href="' + base + '/' + other + '"')
    }
  },
)
