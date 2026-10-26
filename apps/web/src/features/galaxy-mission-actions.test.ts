import { expect, it } from 'vitest'
import { colonizationStatus } from '../client-model/colonization'
import {
  galaxyMissionActions,
  galaxyMissionCapabilities,
  protectionExplanation,
} from './galaxy-mission-actions'
import type { components } from '../contracts'

const body: NonNullable<components['schemas']['GalaxyPosition4']['body']> = {
  id: 'home',
  owner: 'you',
  kind: 'Planet',
  activity: { type: 'None' },
  inactivity: 'Active',
  vacation: false,
  attack_blocker: null,
  espionage_eligible: false,
}
const position: components['schemas']['GalaxyPosition4'] = {
  coordinates: { galaxy: 1, system: 1, position: 1 },
  body,
  debris: null,
}
const options = {
  position,
  player: 'you',
  origin: 'home',
  missions: { transport: true, attack: true, harvest: true, deploy: true },
  colony: colonizationStatus(null, 1),
}
const debris = { field_identity: 'field', metal: '300', crystal: '0' }
it('can harvest the selected origin, but never target itself with a body mission', () => {
  expect(galaxyMissionActions(options)).toEqual([])
  expect(
    galaxyMissionActions({ ...options, position: { ...position, debris } }),
  ).toEqual([{ mission: 'Harvest' }])
})
it('own colonies offer transport and deployment, not attack', () => {
  expect(
    galaxyMissionActions({ ...options, origin: 'other' }).map((a) => a.mission),
  ).toEqual(['Transport', 'Deploy'])
})
it('protected opponents retain peaceful missions and explain blocked attacks', () => {
  const actions = galaxyMissionActions({
    ...options,
    position: {
      ...position,
      body: {
        ...body,
        id: 'other',
        owner: 'them',
        attack_blocker: 'BeginnerProtected',
      },
      debris,
    },
  })
  expect(actions).toEqual([
    { mission: 'Transport', reason: undefined },
    { mission: 'Attack', reason: protectionExplanation },
    { mission: 'Harvest' },
  ])
})
it('vacation disables body missions without blocking debris harvest', () => {
  const actions = galaxyMissionActions({
    ...options,
    position: {
      ...position,
      body: {
        ...body,
        id: 'other',
        owner: 'them',
        vacation: true,
        attack_blocker: 'TargetVacation',
      },
      debris,
    },
  })
  expect(actions.filter((a) => !a.reason)).toEqual([{ mission: 'Harvest' }])
  expect(actions.filter((a) => a.reason).map((a) => a.mission)).toEqual([
    'Transport',
    'Attack',
  ])
})
it('empty positions only offer colonization and harvest when enabled', () => {
  const empty = { ...position, body: null, debris }
  expect(galaxyMissionActions({ ...options, position: empty })).toEqual([
    { mission: 'Harvest' },
  ])
  expect(
    galaxyMissionActions({
      ...options,
      position: empty,
      colony: { ...options.colony, enabled: true },
    }).map((a) => a.mission),
  ).toEqual(['Colonize', 'Harvest'])
  expect(
    galaxyMissionActions({
      ...options,
      position: empty,
      missions: galaxyMissionCapabilities(null),
    }),
  ).toEqual([])
})
it('derives mission availability from enabled universe capabilities', () => {
  expect(
    galaxyMissionCapabilities({
      capabilities: [
        { capability: 'Transport', enabled: true, reason: 'Available' },
        { capability: 'Harvest', enabled: false, reason: 'UnavailableContent' },
      ],
    }),
  ).toEqual({ transport: true, harvest: false, attack: false, deploy: false })
})
