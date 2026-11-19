import { expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import {
  binding,
  id,
  installGameFixture,
  playerProfilesFixture,
} from '../../tests/fixtures/game'
import { installTutorialFixture } from '../../tests/fixtures/tutorial'
import { routeProgressionOptions } from '../../tests/fixtures/progression-options'

// Invoke the installed route callbacks. Playwright owns handler ordering and
// the active-case interruption; these checks isolate the operation dispatch.
function ports() {
  const handlers = new Map<string, (route: Route) => unknown>()
  const page = {
    route: async (
      pattern: string | RegExp,
      handler: (route: Route) => unknown,
    ) => {
      handlers.set(String(pattern), handler)
    },
  } as unknown as Page
  return { page, handlers }
}
const prefix = `/api/v4/universes/${binding.universe}`
const context = { binding, request_id: id(82) }
function call(method: string, path: string, payload: unknown) {
  const fallback = vi.fn(),
    fulfill = vi.fn()
  const route = {
    request: () => ({
      method: () => method,
      url: () => 'http://fixture.test' + path,
      postDataJSON: () => payload,
    }),
    fallback,
    fulfill,
  } as unknown as Route
  return { route, fallback, fulfill }
}

it('profile fixtures distinguish the signed-in player, rankings selection and unknown sources', async () => {
  const { page, handlers } = ports()
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'Commander' },
    { player: id(31), username: 'Harvester' },
  ])
  const path = `/api/v1/universes/${binding.universe}/player-profiles`
  const read = handlers.get('**' + path)!
  for (const [source, wanted] of [
    [{ type: 'SelfAccount' }, binding.player],
    [{ type: 'Rankings', players: [id(31)] }, id(31)],
  ] as const) {
    const result = call('POST', path, { context, source })
    await read(result.route)
    expect(
      result.fulfill.mock.calls[0][0].json.players.map(
        (p: { player: string }) => p.player,
      ),
    ).toEqual([wanted])
  }
  const unknown = call('POST', path, { context, source: { type: 'Other' } })
  await read(unknown.route)
  expect(unknown.fallback).toHaveBeenCalledOnce()
  expect(unknown.fulfill).not.toHaveBeenCalled()
})

it('the single and bulk quotes dispatcher checks method, selected universe and binding before calling item factories', async () => {
  const { page, handlers } = ports()
  await installGameFixture(page, { protocol: 4 })
  const factory = vi.fn((route: Route) =>
    route.fulfill({ json: { sampled_at: 10, as_of_ms: 10 } }),
  )
  await routeProgressionOptions(page, factory)
  const quote = handlers.get(String(/\/progression-options(?:\/bulk)?$/))!
  const path = prefix + '/progression-options'
  const request = { type: 'Upgrade', body: id(5), building: 'MetalMine' }
  for (const bad of [
    call('PUT', path, { context, request }),
    call('POST', path + '/bulk', {
      context,
      requests: [request, { type: 'Other' }],
    }),
    call('POST', path.replace(binding.universe, id(99)), { context, request }),
    call('POST', path.replace('/v4/', '/v3/'), { context, request }),
    call('POST', path, {
      context: { ...context, binding: { ...binding, epoch: id(99) } },
      request,
    }),
    call('POST', path + '/bulk', { context, request }),
  ]) {
    await quote(bad.route)
    expect(bad.fallback).toHaveBeenCalledOnce()
    expect(bad.fulfill).not.toHaveBeenCalled()
  }
  expect(factory).not.toHaveBeenCalled()
  for (const good of [
    call('POST', path, { context, request }),
    call('POST', path + '/bulk', { context, requests: [request] }),
  ]) {
    await quote(good.route)
    expect(good.fulfill).toHaveBeenCalledOnce()
  }
  expect(factory).toHaveBeenCalledTimes(2)
})

it('a foreign tutorial binding cannot publish guidance or complete an objective', async () => {
  const { page, handlers } = ports()
  const state = await installTutorialFixture(page)
  const foreign = { ...binding, player: id(90) }
  const before = structuredClone(state.data)
  const read = call('POST', prefix + '/world', {
    type: 'Tutorial',
    context: { ...context, binding: foreign },
  })
  await expect(
    handlers.get('**' + prefix + '/world')!(read.route),
  ).rejects.toThrow('Unexpected fixture API operation')
  const action = call('POST', prefix + '/commands', {
    gameplay: {
      protocol: 4,
      binding: foreign,
      command_id: id(90),
      command: { type: 'World', action: { type: 'ReviewProductionSettings' } },
    },
    presence: {
      protocol: 4,
      binding,
      command_id: id(91),
      command: {
        type: 'World',
        action: { type: 'RecordForegroundPresence', paired_command_id: id(90) },
      },
    },
  })
  expect(() =>
    handlers.get('**' + prefix + '/commands')!(action.route),
  ).toThrow('ReviewProductionSettings')
  expect(state.commands).toEqual([])
  expect(state.data).toEqual(before)
  expect(read.fulfill).not.toHaveBeenCalled()
  expect(action.fulfill).not.toHaveBeenCalled()
})
