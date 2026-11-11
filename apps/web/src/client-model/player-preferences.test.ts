import { describe, expect, it, vi } from 'vitest'
import {
  PlayerPreferencesController,
  probePreferenceReason,
  validProbeCount,
} from './player-preferences'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
describe('saved galaxy probe count', () => {
  it('accepts positive whole counts beyond JavaScript precision without capping at inventory', () => {
    for (const count of [
      '1',
      '7',
      '9007199254740993',
      '999999999999999999999999999999999',
    ])
      expect(validProbeCount(count)).toBe(true)
    for (const count of [
      '',
      '0',
      '-1',
      '1.2',
      '1e3',
      '01',
      '+1',
      ' 2',
      '2\n',
      '２',
    ])
      expect(validProbeCount(count)).toBe(false)
  })
  it('publishes only confirmed saves, serializes requests, and preserves the saved value on failure', async () => {
    const save = deferred<{ galaxy_probe_count: string }>()
    const api = vi
      .fn()
      .mockResolvedValueOnce({ galaxy_probe_count: '1' })
      .mockReturnValueOnce(save.promise)
      .mockRejectedValueOnce(Error('offline'))
      .mockRejectedValueOnce(Error('still offline'))
      .mockResolvedValueOnce({ galaxy_probe_count: '11' })
    const controller = new PlayerPreferencesController(api)
    await controller.load()
    const pending = controller.save('7')
    expect(probePreferenceReason(controller.store.getState())).not.toBeNull()
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '1',
    )
    expect(await controller.save('9')).toBe(false)
    expect(await controller.load()).toBe(false)
    save.resolve({ galaxy_probe_count: '7' })
    expect(await pending).toBe(true)
    expect(probePreferenceReason(controller.store.getState())).toBeNull()
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '7',
    )
    expect(await controller.save('11')).toBe(false)
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '7',
    )
    expect(controller.store.getState().error).toContain('Could not confirm')
    expect(controller.store.getState().busy).toBe(false)
    expect(probePreferenceReason(controller.store.getState())).not.toBeNull()
    await controller.load()
    expect(probePreferenceReason(controller.store.getState())).not.toBeNull()
    await controller.load()
    expect(probePreferenceReason(controller.store.getState())).toBeNull()
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '11',
    )
  })
  it('keeps the confirmed count available during a refresh and after a read failure', async () => {
    const controller = new PlayerPreferencesController(
      vi
        .fn()
        .mockResolvedValueOnce({ galaxy_probe_count: '7' })
        .mockRejectedValueOnce(Error('offline')),
    )
    await controller.load()
    const refresh = controller.load()
    expect(controller.store.getState().busy).toBe(true)
    expect(probePreferenceReason(controller.store.getState())).toBeNull()
    await refresh
    expect(controller.store.getState().error).toContain('Could not load')
    expect(probePreferenceReason(controller.store.getState())).toBeNull()
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '7',
    )
  })
  it('blocks Spy until the first preference read succeeds', async () => {
    const controller = new PlayerPreferencesController(
      vi.fn().mockRejectedValueOnce(Error('offline')),
    )
    expect(probePreferenceReason(controller.store.getState())).not.toBeNull()
    await controller.load()
    expect(probePreferenceReason(controller.store.getState())).toContain(
      'Could not load',
    )
  })
  it('ignores responses after the session ends, including after a restart', async () => {
    const old = deferred<{ galaxy_probe_count: string }>()
    const controller = new PlayerPreferencesController(
      vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce({ galaxy_probe_count: '4' }),
    )
    const pending = controller.load()
    controller.stop()
    await controller.load()
    old.resolve({ galaxy_probe_count: '99' })
    await pending
    expect(controller.store.getState().preferences?.galaxy_probe_count).toBe(
      '4',
    )
  })
  it('never submits an invalid count', async () => {
    const api = vi.fn()
    const controller = new PlayerPreferencesController(api)
    expect(await controller.save('0')).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })
})
