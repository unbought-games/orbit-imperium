import { expect, it, vi } from 'vitest'
import type { Page, Route } from '@playwright/test'
import {
  binding,
  id,
  installGameFixture,
  installReportReadReceipt,
  fixtureReportContext,
  playerProfilesFixture,
  refuseFixtureReads,
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
    fulfill = vi.fn(),
    abort = vi.fn()
  const route = {
    request: () => ({
      method: () => method,
      url: () => 'http://fixture.test' + path,
      postDataJSON: () => payload,
    }),
    fallback,
    fulfill,
    abort,
  } as unknown as Route
  return { route, fallback, fulfill, abort }
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
        action: {
          type: 'RecordForegroundPresence',
          cause: 'GameplayGesture',
          body: null,
          paired_command_id: id(90),
        },
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

it('a declared unavailable upgrade only refuses bound reads for the installed body', async () => {
  const { page, handlers } = ports()
  await installGameFixture(page, { protocol: 4 })
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  const handle = handlers.get('**/api/**')!
  const request = { type: 'Upgrade', body: id(5), building: 'MetalMine' }
  const bulk = prefix + '/progression-options/bulk'
  const good = call('POST', bulk, { context, requests: [request] })
  await handle(good.route)
  expect(good.fulfill).toHaveBeenCalledWith({
    status: 404,
    json: { code: 'NotFound' },
  })
  for (const wrong of [
    call('POST', bulk, {
      context,
      requests: [request, { type: 'Other', body: id(5) }],
    }),
    call('POST', bulk, { context, requests: [{ ...request, body: id(100) }] }),
    call('POST', bulk, {
      context: { ...context, binding: { ...binding, epoch: id(99) } },
      requests: [request],
    }),
    call('POST', prefix + '/commands', {
      gameplay: {
        binding,
        command_id: id(80),
        command: { type: 'StartUpgrade', body: id(5) },
      },
    }),
  ]) {
    await handle(wrong.route)
    expect(wrong.fallback).toHaveBeenCalledOnce()
    expect(wrong.fulfill).not.toHaveBeenCalled()
  }
})

it.each(['response', 'abort'])(
  'a modeled quote %s cannot hide a missing sibling in a bulk request',
  async (mode) => {
    const { page, handlers } = ports()
    await installGameFixture(page, { protocol: 4 })
    await routeProgressionOptions(page, (route) => {
      if (route.request().postDataJSON().request.type !== 'Upgrade')
        return route.fallback()
      return mode === 'response'
        ? route.fulfill({ status: 503 })
        : route.abort('failed')
    })
    const quote = handlers.get(String(/\/progression-options(?:\/bulk)?$/))!
    const path = prefix + '/progression-options/bulk'
    const upgrade = { type: 'Upgrade', body: id(5), building: 'MetalMine' }
    const mixed = call('POST', path, {
      context,
      requests: [
        upgrade,
        { type: 'Research', host: id(5), research: 'ComputerTechnology' },
      ],
    })
    await quote(mixed.route)
    expect(mixed.fallback).toHaveBeenCalledOnce()
    expect(mixed.fulfill).not.toHaveBeenCalled()
    expect(mixed.abort).not.toHaveBeenCalled()
    const modeled = call('POST', path, { context, requests: [upgrade] })
    await quote(modeled.route)
    if (mode === 'response')
      expect(modeled.fulfill).toHaveBeenCalledWith({ status: 503 })
    else expect(modeled.abort).toHaveBeenCalledWith('failed')
  },
)

it('a read acknowledgement needs the installed report and its own matched gameplay gesture', async () => {
  const { page, handlers } = ports()
  await installGameFixture(page, { protocol: 4, viewerRevision: () => '8' })
  const header = { id: id(81), read: false }
  await installReportReadReceipt(page, header)
  const commands = handlers.get('**' + prefix + '/commands')!
  const gameplay = {
    protocol: 4,
    binding,
    command_id: id(90),
    command: {
      type: 'World',
      action: { type: 'MarkReportRead', report: header.id },
    },
  }
  const action = {
    type: 'RecordForegroundPresence',
    cause: 'GameplayGesture',
    body: null,
    paired_command_id: gameplay.command_id,
  }
  const presence = {
    protocol: 4,
    binding,
    command_id: id(91),
    command: { type: 'World', action },
  }
  for (const pair of [
    { gameplay },
    {
      gameplay,
      presence: {
        ...presence,
        command: { type: 'World', action: { ...action, body: undefined } },
      },
    },
    { gameplay, presence: { ...presence, command_id: 'bad-id' } },
    {
      gameplay,
      presence: {
        ...presence,
        command: { type: 'World', action: { ...action, cause: 'Login' } },
      },
    },
    { gameplay, presence: { ...presence, command_id: gameplay.command_id } },
    {
      gameplay: {
        ...gameplay,
        command: {
          type: 'World',
          action: { type: 'MarkReportRead', report: id(82) },
        },
      },
      presence,
    },
  ]) {
    const wrong = call('POST', prefix + '/commands', pair)
    await commands(wrong.route)
    expect(wrong.fallback).toHaveBeenCalledOnce()
    expect(header.read).toBe(false)
  }
  const right = call('POST', prefix + '/commands', { gameplay, presence })
  await commands(right.route)
  expect(header.read).toBe(true)
  expect(right.fulfill.mock.calls[0][0].json).toMatchObject({
    binding,
    command_id: gameplay.command_id,
    status: 'Committed',
    minimum_viewer_revision: '8',
  })
})

it('report fixtures bind direct detail and nested list/read requests before invoking scenario logic', () => {
  const path = prefix + '/reports'
  expect(fixtureReportContext(call('POST', path, { context }).route)).toEqual(
    context,
  )
  expect(
    fixtureReportContext(
      call('POST', path + '/read', { context, reports: [id(81)] }).route,
      'read',
    ),
  ).toEqual(context)
  expect(
    fixtureReportContext(
      call('POST', path + '/' + id(81), context).route,
      id(81),
    ),
  ).toEqual(context)
  for (const wrong of [
    call('PUT', path + '/' + id(81), context),
    call('POST', path + '/' + id(82), context),
    call(
      'POST',
      path.replace(binding.universe, id(99)) + '/' + id(81),
      context,
    ),
    call('POST', path + '/' + id(81), {
      ...context,
      binding: { ...binding, account: id(99) },
    }),
  ])
    expect(() => fixtureReportContext(wrong.route, id(81))).toThrow(
      'Unexpected fixture API operation',
    )
})
