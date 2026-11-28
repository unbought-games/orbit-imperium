import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { id } from '../test-support/bootstrap'
import {
  fleetPresentationFixture,
  fleetFixtureTime,
} from '../test-support/fleet-presentation'
import { PreparedLinkContext } from '../test-support/prepared-link-context'
import { useGameSession } from '../shell/session-context'
import type { components } from '../contracts'
import { FleetTraffic } from './fleet-traffic'
import { occupiedFleetSlots } from '../client-model/game-projection'
import { createGameStore } from '../client-model/game-store'
import { ReportObservation } from './report-observation'
import { reportPreview } from './report-preview'
import { ReportPreviewFacts } from './report-preview-facts'

type S = components['schemas']

it('incoming and outgoing missiles share the ordered fleet list without consuming a fleet slot', () => {
  const { view, body, fleet } = fleetPresentationFixture()
  const at = { galaxy: 1, system: 371, position: 3 }
  view.missions.fleets = [
    { ...fleet, leg: 'Outbound', due_at: fleetFixtureTime + 30000 },
  ]
  view.missions.fleet_slots = '1'
  view.missions.incoming = [
    {
      sender: id(21),
      origin: at,
      target: body.id,
      mission: 'Attack',
      arrival_at: fleetFixtureTime + 120000,
      ships: { visibility: 'Unknown' },
    },
  ]
  view.missiles = [
    {
      id: id(51),
      attacker: view.binding.player,
      origin: body.coordinates,
      target: at,
      target_body: id(20),
      target_kind: 'Planet',
      count: '2',
      arrival_at: fleetFixtureTime + 60000,
      outgoing: true,
    },
    {
      id: id(50),
      attacker: id(21),
      origin: at,
      target: body.coordinates,
      target_body: body.id,
      target_kind: 'Planet',
      count: '3',
      arrival_at: fleetFixtureTime + 90000,
      outgoing: false,
    },
  ]
  function Fleets() {
    const { model } = useGameSession()
    return createElement(FleetTraffic, {
      model,
      view,
      origin: body.id,
      item: null,
    })
  }
  const html = renderToStaticMarkup(
    createElement(PreparedLinkContext, {
      view,
      children: createElement(Fleets),
    }),
  )
  expect(occupiedFleetSlots({ ...createGameStore().getState(), view })).toBe(1)
  expect(html).toContain('aria-label="Empire fleet traffic"')
  expect(html).not.toMatch(
    /No active fleets|No visible incoming fleets|Missile flights/,
  )
  const rows = [
    ...html.matchAll(
      /<article\b[^>]*aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g,
    ),
  ]
  expect(rows.map(([, label]) => label)).toEqual([
    'Transport fleet',
    'Outgoing missile attack',
    'Incoming missile attack',
    'Incoming attack fleet',
  ])
  expect(rows[1][2]).toContain('View missile attack details')
  expect(rows[2][2]).toContain('3 Interplanetary Missiles')
  expect(rows[2][2]).not.toContain('View missile attack details')
})

it('an observed eight-missile impact exposes its six interceptions, losses and defender-only remaining stock', () => {
  const { view, body } = fleetPresentationFixture()
  const preview = {
    kind: 'MissileImpact',
    outcome: 'Impacted',
    attacker: id(21),
    origin: { galaxy: 1, system: 371, position: 3 },
    target: body.coordinates,
    target_kind: 'Planet',
    sent: '8',
    intercepted: '6',
    penetrating: '2',
    destroyed: { RocketLauncher: '120' },
  } satisfies Extract<S['ReportPreview4'], { kind: 'MissileImpact' }>
  const { facts } = reportPreview(preview)
  const row = renderToStaticMarkup(
    createElement(ReportPreviewFacts, { facts }),
  ).replace(/<[^>]+>/g, '')
  expect(row).toContain('6 intercepted · 2 penetrated')
  expect(row).toContain('120 defenses permanently destroyed')
  const payload: S['MissileImpactPayload4'] = {
    ...preview,
    at: fleetFixtureTime,
    primary: 'RocketLauncher',
    interceptors_spent: '6',
    interceptors_remaining: '0',
  }
  const html = renderToStaticMarkup(
    createElement(PreparedLinkContext, {
      view,
      children: createElement(ReportObservation, { payload }),
    }),
  )
  expect(html).toContain('aria-label="Missile impact report"')
  const text = html.replace(/<[^>]+>/g, '')
  expect(text).toContain(
    'Sent8Intercepted6Penetrating2Your interceptors remaining0',
  )
  expect(text).toContain('Permanently destroyed defensesRocket Launcher120')
})
