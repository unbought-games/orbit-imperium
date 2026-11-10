import { expect, it, vi } from 'vitest'
import {
  attemptKey,
  type Attempt,
  type BoundProgressionOptions,
} from '../../client-model/commands'
import type { Coordinator } from '../../client-model/coordinator'
import { createGameStore } from '../../client-model/game-store'
import {
  createManufacturingOrder,
  manufacturingOrderIdentity,
  canBuildManufacturingOrder,
} from './manufacturing-order'
import { manufacturingPreview } from './manufacturing-preview'
import { deferred, progressionFixture } from './progression-test-fixture'

function fixture() {
  const { view, source } = progressionFixture()
  const store = createGameStore()
  store.setState({ view, binding: view.binding, ready: true })
  const validation = deferred<BoundProgressionOptions | null>()
  const receipt = deferred<string | undefined>()
  const model = {
    store,
    ready: true,
    stale: false,
    options: vi.fn(() => validation.promise),
    send: vi.fn<Coordinator['send']>(() => receipt.promise),
  }
  const refresh = vi.fn()
  const order = createManufacturingOrder(model)
  const preview = manufacturingPreview(source, view, '4')!
  const validated: BoundProgressionOptions = {
    ...source,
    request: preview.request,
    terms: preview.terms,
  }
  const build = () => order.build(preview, view.binding, 'draft', refresh)
  function status(status: Attempt['status']) {
    const command = {
      ...preview.request,
      type: 'StartManufacture' as const,
      expected_terms_hash: source.terms_hash!,
    }
    const attempt: Attempt = {
      envelope: {
        protocol: 4,
        binding: view.binding,
        command_id: 'order',
        presence: null,
        command,
      },
      status,
      receipt: null,
      reconciled: status === 'committed',
    }
    store.setState({
      attempts: new Map([[attemptKey(view.binding, 'order'), attempt]]),
    })
  }
  return {
    model,
    order,
    preview,
    source,
    validated,
    validation,
    receipt,
    view,
    refresh,
    build,
    status,
  }
}

it('validates once, sends exact displayed terms and consumes a committed draft once', async () => {
  const f = fixture()
  const events: boolean[] = []
  const unsubscribe = f.order.subscribe(() =>
    events.push(f.order.getSnapshot().busy),
  )
  const running = f.build()
  await f.build()
  expect(f.model.options).toHaveBeenCalledExactlyOnceWith({
    type: 'Manufacture',
    body: 'planet',
    item: { kind: 'Ship', id: 'SmallCargo' },
    quantity: '4',
  })
  expect(f.order.getSnapshot().busy).toBe(true)
  f.validation.resolve(f.validated)
  await f.validation.promise
  expect(f.model.send).toHaveBeenCalledExactlyOnceWith(
    {
      type: 'StartManufacture',
      body: 'planet',
      item: { kind: 'Ship', id: 'SmallCargo' },
      quantity: '4',
      expected_terms_hash: 'b'.repeat(64),
    },
    f.validated,
  )
  f.status('committed')
  f.receipt.resolve('order')
  await running
  expect(f.order.consumeCommitted()).toBe(true)
  expect(f.order.consumeCommitted()).toBe(false)
  expect(events[0]).toBe(true)
  expect(events.at(-1)).toBe(false)
  unsubscribe()
})

it('discards held validation after an inspector identity change or cleanup', async () => {
  const f = fixture()
  const running = f.build()
  f.order.invalidateValidation()
  f.order.invalidateDraft()
  f.validation.resolve(f.validated)
  await running
  expect(f.model.send).not.toHaveBeenCalled()
  expect(f.order.getSnapshot()).toEqual({
    busy: false,
    failure: null,
    submitted: null,
  })
})

it('does not let an obsolete rejection overwrite the current draft', async () => {
  const f = fixture()
  const running = f.build()
  f.order.invalidateValidation()
  f.validation.reject(new Error('old failure'))
  await running
  expect(f.order.getSnapshot().failure).toBeNull()
  expect(f.order.getSnapshot().busy).toBe(false)
})

it.each(['cost', 'quantity', 'duration'] as const)(
  'refreshes changed %s without sending the old displayed order',
  async (change) => {
    const f = fixture()
    const changed = structuredClone(f.validated)
    if (changed.terms?.type !== 'Manufacture') throw Error('fixture')
    if (change === 'cost') changed.terms.unit_cost.metal = '70000000'
    if (change === 'duration') changed.terms.unit_duration_ms = 40000
    if (change === 'quantity') changed.terms.quantity = '5'
    f.validation.resolve(changed)
    await f.build()
    expect(f.refresh).toHaveBeenCalledTimes(1)
    expect(f.model.send).not.toHaveBeenCalled()
    expect(f.order.getSnapshot().failure).toEqual({
      key: 'draft',
      message:
        'Cost or build time changed. Check the updated order and build again.',
    })
  },
)

it('rechecks spending during validation and never retains live affordability as an error', async () => {
  const f = fixture()
  const running = f.build()
  f.view.bodies[0].amounts.metal = '239999999'
  f.validation.resolve(f.validated)
  await running
  expect(f.model.send).not.toHaveBeenCalled()
  expect(f.refresh).toHaveBeenCalledTimes(1)
  expect(f.order.getSnapshot().failure).toBeNull()
  f.view.bodies[0].amounts.metal = '240000000'
  expect(
    canBuildManufacturingOrder(
      f.model,
      manufacturingPreview(f.source, f.view, '4'),
      false,
    ),
  ).toBe(true)
})

it.each(['binding', 'body', 'pending', 'profile'] as const)(
  'rejects live %s changes before command admission',
  async (change) => {
    const f = fixture()
    const running = f.build()
    if (change === 'binding')
      f.view.binding = { ...f.view.binding, epoch: 'another-session' }
    if (change === 'body') f.view.bodies = []
    if (change === 'profile') f.view.profile_hash = 'new-profile'
    if (change === 'pending') f.status('pending')
    f.validation.resolve(f.validated)
    await running
    expect(f.model.send).not.toHaveBeenCalled()
    expect(f.order.getSnapshot().failure?.message).toContain(
      'no longer available',
    )
  },
)

it.each(['pending', 'uncertain', 'rejected', 'submitting'] as const)(
  'does not reset a draft on %s; recovery can consume a later commitment',
  async (status) => {
    const f = fixture()
    f.validation.resolve(f.validated)
    f.status(status)
    // Install the receipt after validation, as the real send boundary does.
    f.model.store.setState({ attempts: new Map() })
    f.model.send.mockImplementation(async () => {
      f.status(status)
      return 'order'
    })
    await f.build()
    expect(f.order.consumeCommitted()).toBe(false)
    f.status('committed')
    expect(f.order.consumeCommitted()).toBe(true)
    expect(f.order.consumeCommitted()).toBe(false)
  },
)

it.each([
  'before-send-returns',
  'before-receipt',
  'edit-away-and-back',
] as const)('preserves the next draft changed %s', async (phase) => {
  const f = fixture()
  f.validation.resolve(f.validated)
  const running = f.build()
  await f.validation.promise
  if (phase === 'before-send-returns') f.order.invalidateDraft()
  f.status('pending')
  f.receipt.resolve('order')
  await running
  if (phase !== 'before-send-returns') f.order.invalidateDraft()
  if (phase === 'edit-away-and-back') f.order.invalidateDraft()
  f.status('committed')
  expect(f.order.consumeCommitted()).toBe(false)
})

it('allows quote refresh after commitment without treating it as a quantity edit', async () => {
  const f = fixture()
  f.validation.resolve(f.validated)
  f.receipt.resolve('order')
  await f.build()
  f.order.invalidateValidation()
  f.status('committed')
  expect(f.order.consumeCommitted()).toBe(true)
})

it.each(['unready', 'stale', 'pending', 'blocked', 'invalid'] as const)(
  'does not inspect or send an %s order',
  async (reason) => {
    const f = fixture()
    if (reason === 'unready') f.model.ready = false
    if (reason === 'stale') f.model.stale = true
    if (reason === 'pending') f.status('pending')
    if (reason === 'blocked')
      f.preview.blockers.push({
        code: 'UnavailableContent',
        requirement: null,
        required: null,
        actual: null,
        resource: null,
        unit: null,
      })
    await f.order.build(
      reason === 'invalid' ? null : f.preview,
      f.view.binding,
      'draft',
      f.refresh,
    )
    expect(f.model.options).not.toHaveBeenCalled()
    expect(f.model.send).not.toHaveBeenCalled()
  },
)

it.each([null, new Error('offline')])(
  'reports a failed validation and permits an explicit retry (%s)',
  async (failure) => {
    const f = fixture()
    const running = f.build()
    if (failure) f.validation.reject(failure)
    else f.validation.resolve(null)
    await running
    expect(f.order.getSnapshot().busy).toBe(false)
    expect(f.order.getSnapshot().failure?.message).toBe(
      failure
        ? 'offline'
        : 'Unable to build. Check your connection and try again.',
    )
    f.model.options.mockResolvedValue(f.validated)
    f.model.send.mockResolvedValue(undefined)
    await f.build()
    expect(f.order.getSnapshot().failure).toBeNull()
    expect(f.order.consumeCommitted()).toBe(false)
  },
)

it('keys edits and structural validation separately from a committed draft', () => {
  const { source, view } = progressionFixture()
  const identity = (quantity: string) =>
    manufacturingOrderIdentity(
      source,
      view,
      quantity,
      manufacturingPreview(source, view, quantity),
    )
  const original = identity('4')
  const edited = identity('2')
  expect(edited.validation).not.toBe(original.validation)
  expect(edited.draft).not.toBe(original.draft)
  expect(edited.error).not.toBe(original.error)
  if (source.terms?.type !== 'Manufacture') throw Error('fixture')
  source.terms.unit_duration_ms = 40000
  expect(identity('4').validation).not.toBe(original.validation)
  expect(identity('4').draft).toBe(original.draft)
  expect(identity('4').error).toBe(original.error)
  source.terms.unit_duration_ms = 30000
  view.viewer_revision = '2'
  view.bodies[0].amounts.metal = '500000000'
  expect(identity('4')).toEqual(original)
  view.bodies[0].inventories.push({
    item: { kind: 'Ship', id: 'SmallCargo' },
    count: '4',
  })
  expect(identity('4').validation).not.toBe(original.validation)
  expect(identity('4').draft).toBe(original.draft)
  view.binding = { ...view.binding, epoch: 'new-session' }
  expect(identity('4').draft).not.toBe(original.draft)
})
