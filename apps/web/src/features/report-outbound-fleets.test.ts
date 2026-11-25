import { expect, it } from 'vitest'
import type { Attempt } from '../client-model/commands'
import { createGameStore } from '../client-model/game-store'
import type { components } from '../contracts'
import { id } from '../test-support/bootstrap'
import {
  fleetFixtureTime,
  fleetPresentationFixture,
} from '../test-support/fleet-presentation'
import {
  outboundFleetTargets,
  reportHasOutboundFleet,
} from './report-outbound-fleets'

type S = components['schemas']

function fixture() {
  const { view } = fleetPresentationFixture()
  const fleet: S['OwnMission4'] = {
    ...view.missions.fleets[0],
    leg: 'Outbound',
    can_recall: true,
  }
  const moon = view.bodies[1]
  const preview = {
    kind: 'Espionage',
    target: {
      body: moon.id,
      coordinates: moon.coordinates,
      kind: 'Moon',
      owner: view.binding.player,
      name: 'Old name',
    },
  } satisfies S['ReportPreview4']
  view.sampled_at = fleetFixtureTime
  view.missions.fleets = [fleet]
  const state = { ...createGameStore().getState(), ready: true, view }
  return { state, fleet, preview }
}

it('matches the bound body even after a rename and ignores co-located bodies and incomplete previews', () => {
  const { state, preview } = fixture()
  const targets = outboundFleetTargets(state)
  expect(reportHasOutboundFleet(preview, targets)).toBe(true)
  expect(
    reportHasOutboundFleet(
      { ...preview, target: { ...preview.target, body: id(50) } },
      targets,
    ),
  ).toBe(false)
  expect(
    reportHasOutboundFleet(
      {
        ...preview,
        target: { ...preview.target, body: id(5), kind: 'Planet' },
      },
      targets,
    ),
  ).toBe(false)
  expect(
    reportHasOutboundFleet(
      { ...preview, target: { ...preview.target, owner: id(51) } },
      targets,
    ),
  ).toBe(false)
  expect(reportHasOutboundFleet({ kind: 'Espionage' }, targets)).toBe(false)
  expect(
    reportHasOutboundFleet(
      { kind: 'Combat', target: preview.target.coordinates },
      targets,
    ),
  ).toBe(false)
})

it('expires at arrival on the live server clock even if the snapshot still shows outbound', () => {
  const { state, fleet, preview } = fixture()
  const receivedAt = 2000
  const arrival = receivedAt + fleet.due_at - state.view.sampled_at
  expect(
    reportHasOutboundFleet(
      preview,
      outboundFleetTargets({ ...state, receivedAt, now: arrival - 1 }),
    ),
  ).toBe(true)
  expect(
    reportHasOutboundFleet(
      preview,
      outboundFleetTargets({ ...state, receivedAt, now: arrival }),
    ),
  ).toBe(false)
})

it('omits holding, returning and coordinate-only flights, and suppresses stale snapshots', () => {
  const { state, fleet, preview } = fixture()
  expect(
    reportHasOutboundFleet(
      preview,
      outboundFleetTargets({ ...state, stale: true }),
    ),
  ).toBe(false)
  state.view.missions.fleets = [
    { ...fleet, leg: 'Returning' },
    { ...fleet, id: id(52), leg: 'Holding' },
    {
      ...fleet,
      id: id(53),
      intent: {
        ...fleet.intent,
        mission: 'Harvest',
        destination: {
          type: 'Debris',
          coordinates: fleet.destination,
          field_identity: id(54),
        },
      },
    },
  ]
  expect(reportHasOutboundFleet(preview, outboundFleetTargets(state))).toBe(
    false,
  )
})

it('hides the recalled fleet while its command is unresolved and restores the cue if rejected', () => {
  const { state, fleet, preview } = fixture()
  const attempt: Attempt = {
    envelope: {
      protocol: 4,
      binding: state.view.binding,
      command_id: id(55),
      presence: null,
      command: {
        type: 'World',
        action: { type: 'RecallMission', fleet: fleet.id },
      },
    },
    status: 'submitting',
    receipt: null,
    reconciled: false,
  }
  state.attempts.set(attempt.envelope.command_id, attempt)
  expect(reportHasOutboundFleet(preview, outboundFleetTargets(state))).toBe(
    false,
  )

  const otherFleet = { ...fleet, id: id(56) }
  state.view.missions.fleets.push(otherFleet)
  expect(reportHasOutboundFleet(preview, outboundFleetTargets(state))).toBe(
    true,
  )

  state.view.missions.fleets = [fleet]
  attempt.status = 'rejected'
  expect(reportHasOutboundFleet(preview, outboundFleetTargets(state))).toBe(
    true,
  )
})
