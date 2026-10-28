import { describe, expect, it, vi } from 'vitest'
import { readyFixture, id } from '../test-support/bootstrap'
import { Coordinator } from './coordinator'
import { ContractDataError } from './schema'
import type {
  BoundProgressionOptions,
  BoundQuote,
  BoundReport,
  BoundReports,
  BoundWorld,
  GamePort,
  QueryContext,
  QuoteRequest,
  WorldQuery,
} from './commands'

const upgrade = (body = id(40)): QuoteRequest => ({
  type: 'Upgrade',
  body,
  building: 'MetalMine',
})
const destination = {
  type: 'Body' as const,
  id: id(41),
  expected_kind: 'Planet' as const,
  expected_owner: id(2),
}
const resources = { metal: '0', crystal: '0', deuterium: '0' }
function metadata(context: QueryContext) {
  return {
    ...context,
    protocol: 4 as const,
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
  }
}
function quote(context: QueryContext, request: QuoteRequest): BoundQuote {
  return {
    ...metadata(context),
    request,
    terms: {
      terms_hash: 'b'.repeat(64),
      material: {
        type: 'Building',
        profile_hash: 'a'.repeat(64),
        body: id(40),
        building: 'MetalMine',
        action: 'Upgrade',
        source_level: 0,
        target_level: 1,
        paid: resources,
        duration_ms: 1000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
    },
  }
}
function options(
  context: QueryContext,
  request: QuoteRequest,
): BoundProgressionOptions {
  if (request.type === 'Transport') throw Error('not a progression request')
  return {
    ...metadata(context),
    request,
    terms: null,
    terms_hash: null,
    blockers: [],
    estimates: null,
  }
}
function world(context: QueryContext): BoundWorld {
  return { ...metadata(context), data: destination }
}
function reports(context: QueryContext): BoundReports {
  return {
    ...metadata(context),
    data: { items: [], next_cursor: null, has_more: false, as_of_ms: 1000 },
  }
}
function report(context: QueryContext): BoundReport {
  return {
    ...metadata(context),
    data: {
      header: {
        id: id(50),
        kind: 'Returned',
        observed_at: 1000,
        read: false,
        hidden: false,
      },
      payload: {
        kind: 'Returned',
        fleet: id(51),
        origin: id(40),
        destination,
        cargo: resources,
        ships: [],
        at: 1000,
      },
    },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}
async function setup() {
  const { session, snapshot } = readyFixture(4)
  const port = {
    currentBinding: vi.fn(async (_: string, request_id: string) => ({
      ...snapshot.candidate,
      request_id,
    })),
    settings: vi.fn(async (context: QueryContext) => ({
      ...snapshot.settings,
      ...context,
    })),
    view: vi.fn(async (context: QueryContext) => ({
      ...snapshot.view,
      ...context,
      viewer_revision: '1',
    })),
    quote: vi.fn(async (context: QueryContext, request: QuoteRequest) =>
      quote(context, request),
    ),
    progressionOptions: vi.fn(
      async (context: QueryContext, request: QuoteRequest) =>
        options(context, request),
    ),
    world: vi.fn(async (context: QueryContext, _query: WorldQuery) =>
      world(context),
    ),
    reports: vi.fn(
      async (
        context: QueryContext,
        _cursor: string | null,
        _includeHidden?: boolean,
      ) => reports(context),
    ),
    report: vi.fn(async (context: QueryContext, _id: string) =>
      report(context),
    ),
    submit: vi.fn<GamePort['submit']>(),
    receipt: vi.fn<GamePort['receipt']>(),
  } satisfies GamePort
  let sequence = 100
  const model = new Coordinator(
    port,
    {
      load: async () => [],
      put: async () => {},
      remove: async () => {},
      clear: async () => {},
    },
    {
      newId: () => id(sequence++),
      monotonicNowMs: () => 0,
      isOnline: () => true,
    },
  )
  await model.initialize(session, snapshot)
  return { model, port, session, snapshot }
}
const reads = {
  quote: (model: Coordinator) => model.quote(upgrade()),
  progressionOptions: (model: Coordinator) => model.options(upgrade()),
  world: (model: Coordinator) =>
    model.world({
      type: 'ResolveDestination',
      selection: {
        type: 'BodyAt',
        coordinates: { galaxy: 1, system: 1, position: 1 },
        kind: 'Planet',
      },
    }),
  reports: (model: Coordinator) => model.reportPage(id(60), true),
  report: (model: Coordinator) => model.reportDetail(id(50)),
  view: async (model: Coordinator) => {
    await model.refresh()
    return model.view
  },
}

describe.each(Object.keys(reads) as (keyof typeof reads)[])(
  '%s response fencing',
  (endpoint) => {
    it('accepts a matching response', async () => {
      const { model, port } = await setup()
      expect(await reads[endpoint](model)).not.toBeNull()
      expect(port[endpoint]).toHaveBeenCalledTimes(1)
      if (endpoint === 'reports')
        expect(port.reports).toHaveBeenCalledWith(
          expect.anything(),
          id(60),
          true,
        )
      if (endpoint === 'report')
        expect(port.report).toHaveBeenCalledWith(expect.anything(), id(50))
      if (endpoint === 'view') expect(model.view?.viewer_revision).toBe('1')
    })

    it.each(['request', 'binding', 'session'] as const)(
      'drops a response from the wrong %s',
      async (mismatch) => {
        const { model, port, session, snapshot } = await setup()
        const gate = deferred<void>()
        // Delay the real typed fixture, changing only its transport identity.
        const original = port[endpoint].getMockImplementation()!
        port[endpoint].mockImplementationOnce((async (...args: never[]) => {
          const result = await (
            original as (...args: never[]) => Promise<QueryContext>
          )(...args)
          await gate.promise
          if (mismatch === 'request') result.request_id = id(999)
          if (mismatch === 'binding')
            result.binding = { ...result.binding, epoch: id(999) }
          return result
        }) as never)
        const pending = reads[endpoint](model)
        if (mismatch === 'session') {
          await model.logout()
          // Identical binding is insufficient: the login generation must match too.
          await model.initialize(session, snapshot)
        }
        const previous = model.view
        gate.resolve()
        expect(await pending).toBe(endpoint === 'view' ? previous : null)
        expect(model.view).toBe(previous)
        expect(model.ready).toBe(true)
      },
    )

    it('retains runtime schema validation', async () => {
      const { model, port } = await setup()
      port[endpoint].mockResolvedValueOnce({ protocol: 4 } as never)
      if (endpoint === 'view') {
        await reads.view(model)
        expect(model.view?.viewer_revision).toBe('0')
        expect(model.stale).toBe(true)
      } else
        await expect(reads[endpoint](model)).rejects.toBeInstanceOf(
          ContractDataError,
        )
    })
  },
)

it('drops older quote successes but accepts concurrent option requests out of order', async () => {
  const { model, port } = await setup()
  const oldQuote = deferred<BoundQuote>()
  const oldOptions = deferred<BoundProgressionOptions>()
  port.quote.mockReturnValueOnce(oldQuote.promise)
  port.progressionOptions.mockReturnValueOnce(oldOptions.promise)
  const pendingQuote = model.quote(upgrade())
  const pendingOptions = model.options(upgrade())
  expect(await model.quote(upgrade(id(41)))).not.toBeNull()
  expect(await model.options(upgrade(id(41)))).not.toBeNull()
  oldQuote.resolve(quote(port.quote.mock.calls[0][0], upgrade()))
  oldOptions.resolve(
    options(port.progressionOptions.mock.calls[0][0], upgrade()),
  )
  expect(await pendingQuote).toBeNull()
  expect(await pendingOptions).toMatchObject({ request: upgrade() })
})

it.each(['quote', 'progressionOptions'] as const)(
  '%s captures caller input and rejects a mismatched echoed request',
  async (endpoint) => {
    const { model, port } = await setup()
    const gate = deferred<void>()
    const original = port[endpoint].getMockImplementation()!
    port[endpoint].mockImplementationOnce(async (context, request) => {
      await gate.promise
      return original(context, request) as never
    })
    const request = upgrade()
    const pending =
      endpoint === 'quote' ? model.quote(request) : model.options(request)
    if (request.type === 'Upgrade') request.body = id(99)
    gate.resolve()
    expect(await pending).toMatchObject({ request: upgrade() })
    port[endpoint].mockImplementationOnce(
      async (context) => original(context, upgrade(id(99))) as never,
    )
    expect(await reads[endpoint](model)).toBeNull()
  },
)

it('normalizes fleet ship order while checking intent and the current profile', async () => {
  const { model, port } = await setup()
  const query: Extract<WorldQuery, { type: 'FleetQuote' }> = {
    type: 'FleetQuote',
    intent: {
      origin: id(40),
      destination,
      mission: 'Transport',
      cargo: resources,
      speed_percent: 100,
      ships: [
        { owner: id(2), ship_type: 'SmallCargo', count: '1' },
        { owner: id(2), ship_type: 'LargeCargo', count: '2' },
      ],
    },
  }
  const terms = {
    intent: {
      ...query.intent,
      ships: structuredClone(query.intent.ships).reverse(),
    },
    profile_hash: 'a'.repeat(64),
    terms_hash: 'b'.repeat(64),
    distance: 5,
    speeds: [],
    duration_ms: 1000,
    fuel: '0',
    capacity: '1',
    maximum_payload: '1',
    slot_limit: '1',
  }
  port.world.mockImplementation(async (context) => ({
    ...metadata(context),
    data: structuredClone(terms),
  }))
  expect(await model.world(query)).toEqual(terms)
  terms.intent.ships[0].count = '3'
  expect(await model.world(query)).toBeNull()
  terms.intent.ships[0].count = '2'
  terms.profile_hash = 'c'.repeat(64)
  expect(await model.world(query)).toBeNull()
})

it('keeps the newer view when an older request returns a higher revision', async () => {
  const { model, port } = await setup()
  const pending = deferred<Awaited<ReturnType<GamePort['view']>>>()
  port.view.mockReturnValueOnce(pending.promise)
  const older = model.refresh()
  await model.refresh()
  const newer = model.view
  pending.resolve({
    ...newer!,
    request_id: port.view.mock.calls[0][0].request_id,
    viewer_revision: '2',
  })
  await older
  expect(model.view).toBe(newer)
})

it.each(['progressionOptions', 'reports', 'report', 'world'] as const)(
  '%s propagates non-retryable errors without changing session state',
  async (endpoint) => {
    const { model, port } = await setup()
    const error = { status: 404, code: 'NotFound' }
    port[endpoint].mockRejectedValueOnce(error)
    await expect(reads[endpoint](model)).rejects.toBe(error)
    expect(model.ready).toBe(true)
    expect(model.stale).toBe(false)
    expect(model.accessLost).toBe(false)
    expect(port[endpoint]).toHaveBeenCalledTimes(1)
  },
)

it('restarts paging after acknowledged reads, reconciles later stale mail, and fences session resets', async () => {
  const { model, port } = await setup()
  const mailbox: import('./social-mailbox').SocialMailbox = {
    conversations: [
      {
        contact: {
          player: id(90),
          username: 'Nova',
          blocked: false,
          request: null,
          requested_by: null,
          accepted: false,
        },
        latest: {
          id: id(91),
          sequence: '1',
          sender: id(90),
          body: 'Hello',
          sent_at: 1000,
        },
        unread: true,
      },
    ],
    circulars: [
      {
        id: id(94),
        alliance: id(95),
        alliance_name: 'Stars',
        alliance_tag: 'STAR',
        sender: id(90),
        sender_name: 'Nova',
        body: 'Hello alliance',
        sent_at: 1000,
        read: false,
      },
    ],
  }
  const gate = deferred<void>()
  const pageCalls: string[] = []
  Object.assign(port, {
    socialQuery: async (
      context: QueryContext,
      query: import('./social').SocialQuery,
    ) => {
      pageCalls.push(`${query.type}:${'cursor' in query ? query.cursor : null}`)
      await gate.promise
      return {
        ...context,
        conversations:
          query.type === 'Conversations' && !query.cursor
            ? mailbox.conversations
            : [],
        circulars: query.type === 'Circulars' ? mailbox.circulars : [],
        messages: [],
        contacts: [],
        contact: null,
        next_cursor:
          query.type === 'Conversations' && !query.cursor ? id(93) : null,
      }
    },
    socialCommand: async (
      _context: QueryContext,
      request: import('./social').SocialRequest,
    ) => ({ command_id: request.command_id, message: null }),
  })
  model.store.setState({ mailbox })
  const work = model.refreshMailbox()
  await model.socialCommand({
    command_id: id(92),
    action: { type: 'Read', player: id(90), message: id(91) },
  })
  await model.socialCommand({
    command_id: id(96),
    action: { type: 'ReadCircular', circular: id(94) },
  })
  expect(model.refreshMailbox()).toBe(work)
  gate.resolve()
  await expect(work).resolves.toBeUndefined()
  expect(pageCalls.filter((call) => call.startsWith('Conversations'))).toEqual([
    'Conversations:null',
    'Conversations:null',
    `Conversations:${id(93)}`,
  ])
  expect(model.store.getState().mailbox?.circulars[0].read).toBe(true)
  // The server can still return an old unread observation on the next refresh.
  await model.refreshMailbox()
  expect(model.store.getState().mailbox?.conversations[0].unread).toBe(false)
  expect(model.store.getState().mailbox?.circulars[0].read).toBe(true)
  mailbox.conversations[0].latest = {
    ...mailbox.conversations[0].latest,
    id: id(97),
    sequence: '2',
  }
  await model.refreshMailbox()
  expect(model.store.getState().mailbox?.conversations[0].unread).toBe(true)
  const old = model.refreshMailbox()
  model.invalidate()
  await expect(old).rejects.toThrow('Unable to confirm your inbox')
  expect(model.store.getState().mailbox).toBeNull()
})
