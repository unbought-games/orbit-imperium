import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  InsigniaController,
  defaultInsignia,
  selectedInsigniaDesign,
  symbolAccess,
} from './insignias'
import type { InsigniaState } from '../adapters/insignias'
const id = '00000000-0000-4000-8000-000000000001'
const snapshot = (): InsigniaState => ({
  binding: { account: id, player: id, universe: id, epoch: id },
  request_id: id,
  library: { designs: [], equipped: null, permanent_symbols: [] },
  catalog: [
    {
      id: 'test-star',
      name: 'Test star',
      supporter: true,
      asset_url: `/api/media/insignias/test-star/${'a'.repeat(64)}.svg`,
      access: 'available',
    },
  ],
  policy: 'supporter',
  appearance: {
    recipe: defaultInsignia,
    asset_url: `/api/media/insignias/compass/${'b'.repeat(64)}.svg`,
  },
  expires_at: 100,
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('insignia eligibility', () => {
  it('keeps saved designs accessible without equipment or after a selection disappears', () => {
    const state = snapshot()
    const first = { id, name: 'First', recipe: defaultInsignia, revision: 1 }
    const second = {
      ...first,
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Second',
    }
    expect(selectedInsigniaDesign(undefined, null)).toBeUndefined()
    expect(selectedInsigniaDesign(state, null)).toBeUndefined()
    state.library.designs = [first, second]
    expect(selectedInsigniaDesign(state, null)).toBe(first)
    state.library.equipped = second.id
    expect(selectedInsigniaDesign(state, null)).toBe(second)
    expect(selectedInsigniaDesign(state, first.id)).toBe(first)
    expect(selectedInsigniaDesign(state, 'deleted')).toBe(second)
    state.library.equipped = null
    expect(selectedInsigniaDesign(state, 'deleted')).toBe(first)
  })
  it('expires membership evidence but preserves permanent and unrestricted access', () => {
    const state = snapshot()
    expect(symbolAccess(state, 'test-star', 99_999)).toBe('available')
    expect(symbolAccess(state, 'test-star', 100_000)).toBe('unavailable')
    state.library.permanent_symbols = ['test-star']
    expect(symbolAccess(state, 'test-star', 100_001)).toBe('available')
    state.library.permanent_symbols = []
    state.policy = 'unrestricted'
    expect(symbolAccess(state, 'test-star', 100_001)).toBe('available')
  })
  it('does not unlock uninstalled items through unrestricted policy or permanent grants', () => {
    const state = snapshot()
    state.catalog = []
    state.policy = 'unrestricted'
    state.library.permanent_symbols = ['test-star']
    expect(symbolAccess(state, 'test-star', 99_999)).toBe('not_installed')
  })
  it('ignores late responses after the editor closes and refreshes profiles after a save', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(90_000)
    vi.stubGlobal('document', new EventTarget())
    vi.stubGlobal('window', new EventTarget())
    let resolve!: (value: InsigniaState) => void
    const changed = vi.fn()
    const api = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<InsigniaState>((r) => {
            resolve = r
          }),
      )
      .mockResolvedValue(snapshot())
    const controller = new InsigniaController(api, changed)
    const stop = controller.start()
    stop()
    resolve(snapshot())
    await Promise.resolve()
    expect(controller.store.getState().snapshot).toBeUndefined()
    const stopAgain = controller.start()
    await Promise.resolve()
    expect(await controller.perform({ type: 'Equip', design_id: null })).toBe(
      true,
    )
    expect(changed).toHaveBeenCalledTimes(1)
    stopAgain()
  })
})
