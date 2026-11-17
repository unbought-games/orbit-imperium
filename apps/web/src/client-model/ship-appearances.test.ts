import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ShipAppearancesController,
  type ShipAppearanceApi,
} from './ship-appearances'
import type {
  ShipAppearanceAction,
  ShipAppearanceState,
} from './ship-appearance-types'

const observation = (revision = 1): ShipAppearanceState => ({
  binding: {
    account: 'account',
    universe: 'universe',
    player: 'player',
    epoch: 'epoch',
  },
  request_id: 'request',
  catalog: [],
  dyes: [],
  library: [],
  equipment: [],
  emblem: null,
  emblem_revision: revision,
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const action: ShipAppearanceAction = {
  type: 'Reset',
  target: 'LightFighter',
  expected_equipment_revision: 1,
}
const controllers: ShipAppearancesController[] = []
function controller(api: ShipAppearanceApi) {
  let sequence = 0
  const instance = new ShipAppearancesController(
    api,
    () => `request-${++sequence}`,
  )
  controllers.push(instance)
  return instance
}
afterEach(() => {
  controllers.forEach((item) => item.stop())
  controllers.length = 0
  vi.useRealTimers()
})

describe('ship appearance observations', () => {
  it('prevents an earlier read from replacing a completed customization mutation', async () => {
    const old = deferred<ShipAppearanceState>()
    const instance = controller(async (request) =>
      request.type === 'Load' ? old.promise : observation(2),
    )
    instance.start()
    expect(await instance.perform(action)).toBe(true)
    old.resolve(observation(1))
    await old.promise
    expect(instance.store.getState().snapshot?.emblem_revision).toBe(2)
  })

  it('reuses request identity after an ambiguous mutation failure and retains observations', async () => {
    const ids: string[] = []
    let fail = true
    const instance = controller(async (request, _signal, id) => {
      if (request.type !== 'Load') {
        ids.push(id)
        if (fail) throw Error('connection closed after commit')
      }
      return observation()
    })
    instance.start()
    await instance.reload()
    expect(await instance.perform(action)).toBe(false)
    expect(instance.store.getState().snapshot).not.toBeNull()
    fail = false
    expect(await instance.perform(action)).toBe(true)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
  })

  it('allows another version after acknowledgement while rendering continues, without polling over an in-flight save', async () => {
    const accepted = deferred<ShipAppearanceState>()
    let loads = 0
    const instance = controller(async (request) => {
      if (request.type === 'Load') {
        loads++
        return observation()
      }
      return accepted.promise
    })
    instance.start()
    await instance.reload()
    const mutation = instance.perform(action)
    const before = loads
    await instance.reload()
    expect(loads).toBe(before)
    const pending = observation()
    pending.equipment = [
      {
        target: 'LightFighter',
        revision: 2,
        design_id: null,
        design_revision: null,
        artwork: null,
        render: {
          id: 'bake',
          stage: 'rendering',
          can_cancel: true,
          can_retry: false,
        },
      },
    ]
    accepted.resolve(pending)
    expect(await mutation).toBe(true)
    expect(instance.store.getState().busy).toBe(false)
    expect(
      await instance.perform({ ...action, expected_equipment_revision: 2 }),
    ).toBe(true)
  })

  it('refreshes pending render output and ignores completion after session teardown', async () => {
    vi.useFakeTimers()
    const late = deferred<ShipAppearanceState>()
    let calls = 0
    const pending = observation()
    pending.equipment = [
      {
        target: 'LightFighter',
        revision: 1,
        design_id: null,
        design_revision: null,
        artwork: null,
        render: {
          id: 'bake',
          stage: 'queued',
          can_cancel: true,
          can_retry: false,
        },
      },
    ]
    const instance = controller(async () =>
      ++calls === 1 ? pending : late.promise,
    )
    instance.start()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1500)
    expect(calls).toBe(2)
    instance.stop()
    late.resolve(observation(10))
    await late.promise
    expect(instance.store.getState().snapshot?.emblem_revision).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})
