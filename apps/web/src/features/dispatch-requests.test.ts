import { expect, it, vi } from 'vitest'
import type { components } from '../contracts'
import {
  DispatchRequests,
  type DispatchReviewInput,
  type DispatchReviewPorts,
} from './dispatch-requests'
type S = components['schemas']
const at = { galaxy: 1, system: 2, position: 3 }
const destination: S['MissionDestination4'] = {
  type: 'Body',
  id: 'colony',
  expected_owner: 'me',
  expected_kind: 'Planet',
}
const input: DispatchReviewInput = {
  coordinateProblems: {},
  targetProblem: '',
  galaxy: '1',
  system: '2',
  position: '3',
  targetKind: 'planet',
  mission: 'Deploy',
  holdHours: 1,
  speed: 100,
  types: ['SmallCargo', 'LightFighter'],
  ships: { SmallCargo: '1' },
  cargo: ['0', '0', '0'],
  player: 'me',
  originId: 'home',
  draft: null,
}
function terms(intent: S['FleetIntent4']): S['FleetTerms4'] {
  return {
    intent,
    profile_hash: 'profile',
    terms_hash: 'terms',
    distance: 1000,
    speeds: [],
    duration_ms: 100000,
    fuel: '1000000',
    capacity: '50000000',
    maximum_payload: '50000000',
    slot_limit: '5',
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function fixture() {
  const requests = new DispatchRequests()
  let amounts = {
    metal: '100000000',
    crystal: '40000000',
    deuterium: '11000000',
  }
  const world = vi.fn<DispatchReviewPorts['world']>(async (query) => {
    if (query.type === 'ResolveDestination') return destination
    if (query.type === 'FleetQuote' || query.type === 'FleetEstimate')
      return terms(query.intent)
    throw Error(`Unexpected read ${query.type}`)
  })
  const ports = {
    world,
    origin: () => ({ amounts }),
    quote: vi.fn(),
    cargo: vi.fn(),
    error: vi.fn(),
    busy: vi.fn(),
    clear: vi.fn(),
    refreshSite: vi.fn(),
  } satisfies DispatchReviewPorts
  return {
    requests,
    ports,
    setAmounts: (next: typeof amounts) => {
      amounts = next
    },
  }
}
it.each([
  null,
  {
    mission: 'Attack' as const,
    coordinates: { ...at, position: 1 },
    target: { ...destination, id: 'historical', expected_owner: 'other' },
  },
])(
  'reviews manual and edited historical deploys with canonical manifest: %j',
  async (draft) => {
    const { requests, ports } = fixture()
    await requests.review(
      {
        ...input,
        draft,
        ships: { SmallCargo: '0002', LightFighter: '' },
        cargo: ['00042', '', '000'],
      },
      ports,
    )
    expect(ports.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        terms_hash: 'terms',
        intent: {
          origin: 'home',
          destination,
          mission: 'Deploy',
          ships: [{ owner: 'me', ship_type: 'SmallCargo', count: '2' }],
          cargo: { metal: '42000000', crystal: '0', deuterium: '0' },
          speed_percent: 100,
        },
      }),
    )
    expect(ports.busy.mock.calls).toEqual([[true], [false]])
    expect(ports.cargo).not.toHaveBeenCalled()
  },
)
it.each([{ id: 'replacement' }, { expected_owner: 'new-owner' }])(
  'rechecks historical identity after editing away and back: %j',
  async (change) => {
    const { requests, ports } = fixture()
    const draft = {
      mission: 'Transport' as const,
      coordinates: at,
      target: destination,
    }
    await requests.review(
      { ...input, mission: 'Transport', draft, position: '4' },
      ports,
    )
    expect(ports.quote).toHaveBeenCalledTimes(1)
    ports.world.mockResolvedValue({ ...destination, ...change })
    await requests.review({ ...input, mission: 'Transport', draft }, ports)
    expect(ports.error).toHaveBeenLastCalledWith(
      expect.stringContaining('observed target has changed'),
    )
    expect(ports.quote).toHaveBeenCalledTimes(1)
  },
)
it('lets a historical body switch to harvesting without binding body identity to debris', async () => {
  const { requests, ports } = fixture()
  ports.world.mockResolvedValueOnce({
    type: 'Debris',
    coordinates: at,
    field_identity: 'field',
  })
  await requests.review(
    {
      ...input,
      mission: 'Harvest',
      draft: { mission: 'Attack', coordinates: at, target: destination },
    },
    ports,
  )
  expect(ports.world).toHaveBeenNthCalledWith(1, {
    type: 'ResolveDestination',
    selection: { type: 'DebrisAt', coordinates: at },
  })
  expect(ports.quote).toHaveBeenCalledWith(
    expect.objectContaining({
      intent: expect.objectContaining({ mission: 'Harvest' }),
    }),
  )
})
it.each(['InvalidInput', 'BeginnerProtected', 'CargoCapacity'])(
  'communicates authoritative %s without publishing a quote',
  async (code) => {
    const { requests, ports } = fixture()
    ports.world
      .mockResolvedValueOnce(destination)
      .mockRejectedValueOnce(Error(code))
    await requests.review(input, ports)
    expect(ports.error).toHaveBeenLastCalledWith(
      expect.stringMatching(
        /mission is not valid|Beginner protection|cannot carry this cargo and fuel/,
      ),
    )
    expect(ports.quote).not.toHaveBeenCalled()
    expect(ports.busy).toHaveBeenLastCalledWith(false)
  },
)
it('rejects newly resolved own attack targets before quoting even without local ownership evidence', async () => {
  const { requests, ports } = fixture()
  await requests.review({ ...input, mission: 'Attack' }, ports)
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('cannot attack your own'),
  )
  expect(ports.world).toHaveBeenCalledTimes(1)
  expect(ports.quote).not.toHaveBeenCalled()
})
it.each([
  { coordinateProblems: { system: 'Invalid system' } },
  { targetProblem: 'Invalid target' },
])(
  'rejects local validation before requesting destination: %j',
  async (problem) => {
    const { requests, ports } = fixture()
    await requests.review({ ...input, ...problem }, ports)
    expect(ports.world).not.toHaveBeenCalled()
    expect(ports.error).toHaveBeenLastCalledWith(
      expect.stringContaining('Invalid'),
    )
    expect(ports.busy).toHaveBeenLastCalledWith(false)
  },
)
it.each(['all', 'deuterium'] as const)(
  'fills %s using current stocks, reserves fuel, and never opens review',
  async (fill) => {
    const { requests, ports, setAmounts } = fixture()
    const held = deferred<Awaited<ReturnType<DispatchReviewPorts['world']>>>()
    const entered = deferred<void>()
    ports.world
      .mockResolvedValueOnce(destination)
      .mockImplementationOnce(() => {
        entered.resolve()
        return held.promise
      })
    const result = requests.review(
      { ...input, cargo: ['2', '0', '0'] },
      ports,
      fill,
    )
    await entered.promise
    setAmounts({ metal: '6000000', crystal: '4000000', deuterium: '3000000' })
    const intent: S['FleetIntent4'] = {
      origin: 'home',
      destination,
      mission: 'Deploy',
      ships: [],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    }
    held.resolve(terms(intent))
    await result
    expect(ports.cargo).toHaveBeenLastCalledWith(
      fill === 'all' ? ['6', '4', '2'] : ['2', '0', '2'],
    )
    expect(ports.quote).not.toHaveBeenCalled()
  },
)
it('preserves invalid cargo and surfaces the problem when Add all cannot fill it', async () => {
  const { requests, ports } = fixture()
  await requests.review(
    { ...input, cargo: ['invalid', '0', '0'] },
    ports,
    'all',
  )
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('whole nonnegative'),
  )
  expect(ports.cargo).not.toHaveBeenCalled()
})
it.each(['resolve', 'quote', 'failure', 'all', 'deuterium'] as const)(
  'an edited draft fences a delayed %s completion',
  async (phase) => {
    const { requests, ports } = fixture()
    const held = deferred<Awaited<ReturnType<DispatchReviewPorts['world']>>>()
    const entered = deferred<void>()
    if (phase !== 'resolve') ports.world.mockResolvedValueOnce(destination)
    ports.world.mockImplementationOnce(() => {
      entered.resolve()
      return held.promise
    })
    const old = requests.review(
      input,
      ports,
      phase === 'all' || phase === 'deuterium' ? phase : undefined,
    )
    await entered.promise
    requests.invalidate() // edit, origin switch, or unmount
    const events = {
      errors: ports.error.mock.calls.length,
      busy: ports.busy.mock.calls.length,
    }
    if (phase === 'failure') held.reject(Error('TargetVacation'))
    else
      held.resolve(
        phase === 'resolve'
          ? destination
          : terms({
              origin: 'home',
              destination,
              mission: 'Deploy',
              ships: [],
              cargo: { metal: '0', crystal: '0', deuterium: '0' },
              speed_percent: 100,
            }),
      )
    await old
    expect(ports.quote).not.toHaveBeenCalled()
    expect(ports.cargo).not.toHaveBeenCalled()
    expect(ports.error).toHaveBeenCalledTimes(events.errors)
    expect(ports.busy).toHaveBeenCalledTimes(events.busy)
    if (phase === 'resolve') expect(ports.world).toHaveBeenCalledTimes(1)
  },
)
it('an old quote failure cannot clear a newer review busy state or overwrite its result', async () => {
  const { requests, ports } = fixture()
  const held = deferred<Awaited<ReturnType<DispatchReviewPorts['world']>>>()
  const entered = deferred<void>()
  ports.world.mockResolvedValueOnce(destination).mockImplementationOnce(() => {
    entered.resolve()
    return held.promise
  })
  const old = requests.review(input, ports)
  await entered.promise
  await requests.review({ ...input, cargo: ['42', '0', '0'] }, ports)
  const events = ports.busy.mock.calls.length
  held.reject(Error('TargetVacation'))
  await old
  expect(ports.error.mock.calls).toEqual([[''], ['']])
  expect(ports.busy).toHaveBeenCalledTimes(events)
  expect(ports.quote).toHaveBeenCalledTimes(1)
  expect(ports.quote.mock.calls[0][0].intent.cargo.metal).toBe('42000000')
})
it('submission identity only matches until the next draft edit, origin change, or review', async () => {
  const { requests, ports } = fixture()
  const submitted = requests.invalidate()
  expect(requests.isCurrent(submitted)).toBe(true)
  requests.invalidate()
  expect(requests.isCurrent(submitted)).toBe(false)
  const next = requests.invalidate()
  await requests.review(input, ports)
  expect(requests.isCurrent(next)).toBe(false)
})
it('distinguishes fuel shortages using a fresh fallback estimate and current origin amounts', async () => {
  const { requests, ports, setAmounts } = fixture()
  setAmounts({ metal: '100000000', crystal: '40000000', deuterium: '0' })
  ports.world
    .mockResolvedValueOnce(destination)
    .mockRejectedValueOnce(Error('InsufficientResources'))
  await requests.review(input, ports)
  expect(ports.world.mock.calls[2][0].type).toBe('FleetEstimate')
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('Not enough deuterium for fuel'),
  )
  expect(ports.quote).not.toHaveBeenCalled()
})
it('requests fresh authoritative terms even when a compatible advisory estimate exists', async () => {
  const { requests, ports } = fixture()
  const intent: S['FleetIntent4'] = {
    origin: 'home',
    destination,
    mission: 'Deploy',
    ships: [],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  }
  ports.world
    .mockResolvedValueOnce(destination)
    .mockRejectedValueOnce(Error('InsufficientResources'))
  await requests.review({ ...input, estimate: terms(intent) }, ports)
  expect(ports.world.mock.calls.map(([query]) => query.type)).toEqual([
    'ResolveDestination',
    'FleetQuote',
  ])
  expect(ports.quote).not.toHaveBeenCalled()
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('resources'),
  )
})
it('refreshes private-site context and explains a resolution conflict', async () => {
  const { requests, ports } = fixture()
  ports.world.mockRejectedValueOnce(Error('Conflict'))
  await requests.review(
    {
      ...input,
      siteId: 'site',
      siteSelection: { id: 'site', expected_revision: '2' },
    },
    ports,
  )
  expect(ports.world).toHaveBeenCalledWith({
    type: 'ResolveMissionSite',
    selection: { id: 'site', expected_revision: '2' },
  })
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('site changed'),
  )
  expect(ports.refreshSite).toHaveBeenCalledOnce()
})
it('preserves oversized canonical counts for authoritative NumericRange rejection', async () => {
  const { requests, ports } = fixture()
  ports.world
    .mockResolvedValueOnce(destination)
    .mockRejectedValueOnce(Error('NumericRange'))
  await requests.review(
    { ...input, ships: { SmallCargo: '0018446744073709551616' } },
    ports,
  )
  expect(ports.world).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      type: 'FleetQuote',
      intent: expect.objectContaining({
        ships: [
          {
            owner: 'me',
            ship_type: 'SmallCargo',
            count: '18446744073709551616',
          },
        ],
      }),
    }),
  )
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('One of the entered amounts is too large'),
  )
  expect(ports.quote).not.toHaveBeenCalled()
})
it.each([
  'submitting',
  'pending',
  'uncertain',
  'rejected',
  'committed',
] as const)(
  'only a committed current submission resets the draft: %s',
  (status) => {
    const requests = new DispatchRequests()
    const submitted = {
      key: 'new-order',
      generation: requests.invalidate(),
      coordinates: at,
    }
    expect(requests.shouldResetDraft(null, status)).toBe(false)
    expect(requests.shouldResetDraft(submitted, status)).toBe(
      status === 'committed',
    )
    requests.invalidate()
    expect(requests.shouldResetDraft(submitted, status)).toBe(false)
  },
)
it.each([false, true])(
  'tracks its synchronously registered submission while delivery is pending; edited=%s',
  async (edited) => {
    const requests = new DispatchRequests()
    const held = deferred<string | undefined>()
    let attempts = new Map<string, unknown>([['older-order', {}]])
    const quote = terms({
      origin: 'home',
      destination,
      mission: 'Deploy',
      ships: [],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    })
    const command = {
      type: 'World' as const,
      action: {
        type: 'LaunchFleet' as const,
        intent: quote.intent,
        expected_terms_hash: quote.terms_hash,
      },
    }
    const submitted = vi.fn()
    const closeReview = vi.fn()
    const send = vi.fn<
      import('./dispatch-requests').DispatchSubmitPorts['send']
    >(() => {
      attempts = new Map([...attempts, ['new-order', {}]])
      return held.promise
    })
    const pending = requests.submit(command, quote, at, {
      attempts: () => attempts,
      send,
      submitted,
      closeReview,
    })
    expect(submitted.mock.calls).toEqual([
      [{ key: 'new-order', generation: 1, coordinates: at }],
    ])
    expect(send).toHaveBeenCalledExactlyOnceWith(command, quote)
    expect(closeReview).toHaveBeenCalledOnce()
    if (edited) requests.invalidate()
    held.resolve('new-order')
    await pending
    expect(
      requests.shouldResetDraft(submitted.mock.calls[0][0], 'committed'),
    ).toBe(!edited)
    expect(submitted).toHaveBeenCalledTimes(1)
  },
)
it.each([false, true])(
  'does not clear a newer draft when a send is refused; edited=%s',
  async (edited) => {
    const requests = new DispatchRequests()
    const held = deferred<string | undefined>()
    const quote = terms({
      origin: 'home',
      destination,
      mission: 'Deploy',
      ships: [],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    })
    const command = {
      type: 'World' as const,
      action: {
        type: 'LaunchFleet' as const,
        intent: quote.intent,
        expected_terms_hash: quote.terms_hash,
      },
    }
    const submitted = vi.fn()
    const pending = requests.submit(command, quote, at, {
      attempts: () => new Map(),
      send: () => held.promise,
      submitted,
      closeReview: () => {},
    })
    expect(submitted).not.toHaveBeenCalled()
    if (edited) requests.invalidate()
    held.resolve(undefined)
    await pending
    expect(submitted.mock.calls).toEqual(edited ? [] : [[null]])
  },
)

it('occupied colony resolution stops before quote and reports an actionable error', async () => {
  const { requests, ports } = fixture()
  const held = deferred<Awaited<ReturnType<DispatchReviewPorts['world']>>>()
  ports.world.mockReturnValueOnce(held.promise)
  const reviewing = requests.review(
    {
      ...input,
      mission: 'Colonize',
      ships: { ColonyShip: '1' },
      types: ['ColonyShip'],
    },
    ports,
  )
  expect(ports.world).toHaveBeenCalledExactlyOnceWith({
    type: 'ResolveDestination',
    selection: { type: 'EmptyPositionAt', coordinates: at },
  })
  expect(ports.quote).not.toHaveBeenCalled()
  held.reject(Error('PositionOccupied'))
  await reviewing
  expect(ports.world).toHaveBeenCalledTimes(1)
  expect(ports.quote).not.toHaveBeenCalled()
  expect(ports.error).toHaveBeenLastCalledWith(
    'This position is occupied. Choose an empty position.',
  )
  expect(ports.busy).toHaveBeenLastCalledWith(false)
})

it.each(['all', 'metal', 'crystal', 'deuterium'] as const)(
  'fills %s from an estimate with no fleet slot, while review still rejects',
  async (fill) => {
    const { requests, ports } = fixture()
    ports.world.mockImplementation(async (query) => {
      if (query.type === 'ResolveDestination') return destination
      if (query.type === 'FleetQuote') throw Error('NoFleetSlot')
      if (query.type === 'FleetEstimate') {
        const quote = terms(query.intent)
        return {
          estimate: true,
          intent: query.intent,
          profile_hash: quote.profile_hash,
          capacity: quote.capacity,
          maximum_payload: quote.maximum_payload,
          fuel: quote.fuel,
          duration_ms: quote.duration_ms,
        }
      }
      throw Error('Unexpected request')
    })
    await requests.review(input, ports, fill)
    expect(ports.cargo).toHaveBeenCalledOnce()
    expect(ports.quote).not.toHaveBeenCalled()
    expect(
      ports.cargo.mock.calls[0][0]
        .map(BigInt)
        .reduce((sum: bigint, n: bigint) => sum + n, 0n),
    ).toBeLessThanOrEqual(50n)
    expect(BigInt(ports.cargo.mock.calls[0][0][2])).toBeLessThanOrEqual(10n)
    await requests.review(input, ports)
    expect(ports.quote).not.toHaveBeenCalled()
    expect(ports.error).toHaveBeenLastCalledWith(
      expect.stringContaining('fleet slots'),
    )
  },
)

it.each([false, true])(
  'prepared review waits for fresh availability and cancels after edits: %s',
  async (edited) => {
    const { requests, ports } = fixture()
    const refresh = deferred<void>()
    const review = vi.fn(async () => {})
    const preparing = requests.prepare(() => refresh.promise, review, ports)
    expect(review).not.toHaveBeenCalled()
    expect(ports.busy).toHaveBeenLastCalledWith(true)
    if (edited) requests.invalidate()
    refresh.resolve()
    await preparing
    expect(review).toHaveBeenCalledTimes(edited ? 0 : 1)
  },
)
it('failed preparation refresh leaves confirmation closed with an actionable error', async () => {
  const { requests, ports } = fixture()
  const review = vi.fn(async () => {})
  await requests.prepare(
    async () => {
      throw Error('Offline')
    },
    review,
    ports,
  )
  expect(review).not.toHaveBeenCalled()
  expect(ports.error).toHaveBeenLastCalledWith(
    expect.stringContaining('Unable to refresh your fleet'),
  )
  expect(ports.busy).toHaveBeenLastCalledWith(false)
})
