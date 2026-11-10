import { expect, it, vi } from 'vitest'
import type { BoundProgressionOptions } from '../../client-model/commands'
import {
  currentInspection,
  inspectProgressionOptions,
  type ProgressionInspection,
} from './progression-inspection'
import { deferred, progressionFixture } from './progression-test-fixture'
import { progressionContext } from './options'

it.each(['before', 'after'] as const)(
  'keeps confirmed eligibility when old cancellation options arrive %s fresh options',
  async (order) => {
    const { source, view } = progressionFixture()
    const old = deferred<BoundProgressionOptions | null>()
    const fresh = deferred<BoundProgressionOptions | null>()
    const model = {
      options: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(fresh.promise),
    }
    let response: ProgressionInspection | null = null
    const receive = (value: ProgressionInspection) => {
      response = value
    }
    const previous = inspectProgressionOptions(
      model,
      source.request,
      'active',
      receive,
    )
    previous.cancel()
    const current = inspectProgressionOptions(
      model,
      source.request,
      'cancelled',
      receive,
    )
    const stale = {
      ...source,
      blockers: [
        {
          code: 'ActiveConstruction' as const,
          requirement: null,
          required: null,
          actual: null,
          resource: null,
          unit: null,
        },
      ],
    }
    if (order === 'before') {
      old.resolve(stale)
      await previous.settled
    }
    fresh.resolve(source)
    await current.settled
    if (order === 'after') {
      old.resolve(stale)
      await previous.settled
    }
    expect(currentInspection(source.request, 'cancelled', response)).toEqual({
      proposal: source,
      loading: false,
      error: '',
    })
    expect(currentInspection(source.request, 'active', response)).toEqual({
      proposal: null,
      loading: true,
      error: '',
    })
    current.cancel()
    // Price-only changes do not invalidate inspection; confirmed structural work does.
    const before = progressionContext(view)
    view.bodies[0].amounts.metal = '89999999'
    expect(progressionContext(view)).toBe(before)
    view.constructions.push({
      id: 'active',
      body: 'planet',
      building: 'MetalMine',
      target_level: 2,
      due_at: 2000,
      paid: view.bodies[0].amounts,
    })
    expect(progressionContext(view)).not.toBe(before)
  },
)

it.each(['success', 'null', 'error'] as const)(
  'ignores an obsolete %s on planet change or unmount',
  async (outcome) => {
    const { source } = progressionFixture()
    const gate = deferred<BoundProgressionOptions | null>()
    const receive = vi.fn()
    const inspection = inspectProgressionOptions(
      { options: () => gate.promise },
      source.request,
      'planet',
      receive,
    )
    inspection.cancel()
    if (outcome === 'error') gate.reject(Error('offline'))
    else gate.resolve(outcome === 'success' ? source : null)
    await inspection.settled
    expect(receive).not.toHaveBeenCalled()
  },
)

it.each(['null', 'error'] as const)(
  'ends loading with an actionable %s failure',
  async (outcome) => {
    const { source } = progressionFixture()
    let response: ProgressionInspection | null = null
    const inspection = inspectProgressionOptions(
      {
        options: async () => {
          if (outcome === 'error') throw Error('offline')
          return null
        },
      },
      source.request,
      'current',
      (value) => {
        response = value
      },
    )
    await inspection.settled
    expect(currentInspection(source.request, 'current', response)).toEqual({
      proposal: null,
      loading: false,
      error:
        outcome === 'null'
          ? 'Construction is unavailable. Retry after reconnecting.'
          : 'Unable to inspect this action. Check your connection and try again.',
    })
    expect(currentInspection(null, 'current', response)).toEqual({
      proposal: null,
      loading: false,
      error: '',
    })
    expect(currentInspection(source.request, 'retry', response)).toEqual({
      proposal: null,
      loading: true,
      error: '',
    })
  },
)
