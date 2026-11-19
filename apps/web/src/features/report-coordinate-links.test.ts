import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import type { components } from '../contracts'
import { PreparedLinkContext } from '../test-support/prepared-link-context'
import { id } from '../test-support/bootstrap'
import { fleetPresentationFixture } from '../test-support/fleet-presentation'
import { MissionFleetCardPresentation } from './mission-fleet-card'
import { ReportObservation } from './report-observation'

type S = components['schemas']
const now = 1792756800000
const destination = { galaxy: 1, system: 5, position: 12 }
const resources = { metal: '0', crystal: '0', deuterium: '0' }

const reports = [
  [
    'Espionage',
    {
      kind: 'Espionage',
      observed_at: now,
      target: {
        body: id(99),
        kind: 'Planet',
        owner: id(90),
        coordinates: destination,
      },
      resources: { visibility: 'Unknown' },
      fleet: { visibility: 'Unknown' },
      defenses: { visibility: 'Unknown' },
      buildings: { visibility: 'Unknown' },
      research: { visibility: 'Unknown' },
      activity: { type: 'None' },
      counterespionage: { probability_ppm: 0, detected: false },
    },
    'View target [1:5:12] in galaxy',
  ],
  [
    'Combat',
    {
      kind: 'Combat',
      at: now,
      target: destination,
      outcome: 'Draw',
      mission: 'Attack',
      rounds: [],
      participants: [],
      survivors: [],
      gross_losses: [],
      recovered: [],
      debris: resources,
      loot: resources,
    },
    'View target [1:5:12] in galaxy',
  ],
  [
    'Delivered',
    {
      kind: 'Delivered',
      at: now,
      sender: id(2),
      recipient: id(90),
      origin: { galaxy: 1, system: 2, position: 4 },
      target: destination,
      cargo: resources,
    },
    'View destination [1:5:12] in galaxy',
  ],
  [
    'ColonizationFailed',
    {
      kind: 'ColonizationFailed',
      fleet: id(30),
      origin: id(8),
      at: now,
      return_at: now + 180000,
      destination_coordinates: destination,
      reason: 'Occupied',
    },
    'View destination [1:5:12] in galaxy',
  ],
] satisfies [string, S['ReportPayload4'], string][]

it.each(reports)(
  '%s report links the recorded position when its historical body is absent',
  (_, payload, label) => {
    const html = renderToStaticMarkup(
      createElement(PreparedLinkContext, {
        children: createElement(ReportObservation, { payload }),
      }),
    )
    const anchor = html
      .match(/<a\b[^>]*>/g)
      ?.find((a) => a.includes(`aria-label="${label}"`))
    expect(anchor).toBeDefined()
    const url = new URL(
      anchor!.match(/href="([^"]+)"/)![1].replaceAll('&amp;', '&'),
      'https://orbit.test',
    )
    expect(url.pathname).toBe(
      `/u/andromeda-prime/b/${fleetPresentationFixture().body.id}/galaxy`,
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      galaxy: '1',
      system: '5',
      position: '12',
    })
  },
)

it('a returning flight points home but its destination link still opens the recorded target', () => {
  const { view, body, fleet } = fleetPresentationFixture()
  fleet.leg = 'Returning'
  fleet.destination = destination
  fleet.intent.destination = {
    type: 'Body',
    id: id(99),
    expected_kind: 'Planet',
    expected_owner: id(90),
  }
  const html = renderToStaticMarkup(
    createElement(PreparedLinkContext, {
      children: createElement(MissionFleetCardPresentation, {
        as: 'article',
        view,
        fleet,
        origin: body.id,
        detail: true,
        now,
        tutorial: null,
        universeName: 'Andromeda Prime',
      }),
    }),
  )
  expect(html).toMatch(/aria-label="Returning: [^"]+ ← [^"]+"/)
  const target = html
    .match(/<a\b[^>]*>/g)
    ?.find((link) =>
      link.includes('aria-label="View destination [1:5:12] in galaxy"'),
    )
  expect(target).toContain(
    `href="/u/andromeda-prime/b/${body.id}/galaxy?galaxy=1&amp;system=5&amp;position=12"`,
  )
})
