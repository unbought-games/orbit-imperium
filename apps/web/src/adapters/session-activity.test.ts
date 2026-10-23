import { describe, it, expect, vi } from 'vitest'
import { startSessionActivity } from './session-activity'

function fixture() {
  const events = new Map<string, (event: Event) => void>()
  const target = {
    visibilityState: 'visible',
    addEventListener: (name: string, fn: (event: Event) => void) =>
      events.set(name, fn),
    removeEventListener: (name: string) => events.delete(name),
  }
  return {
    target,
    fire: (name: string, trusted = true) =>
      events.get(name)?.({ isTrusted: trusted } as Event),
  }
}
const flush = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
describe('foreground session renewal', () => {
  it('renews opening and real input, throttles bursts, ignores background/synthetic activity and cleans up', async () => {
    const { target, fire } = fixture(),
      renew = vi.fn().mockResolvedValue(undefined)
    let now = 0
    const stop = startSessionActivity(
      target as unknown as Document,
      target as unknown as Window,
      renew,
      () => now,
    )
    expect(renew).toHaveBeenCalledTimes(1)
    await flush()
    fire('pointerdown')
    expect(renew).toHaveBeenCalledTimes(1)
    now += 60000
    fire('pointerdown', false)
    target.visibilityState = 'hidden'
    fire('keydown')
    fire('visibilitychange')
    expect(renew).toHaveBeenCalledTimes(1)
    // Thirty days of no input never creates an automatic renewal.
    now += 30 * 86400000
    expect(renew).toHaveBeenCalledTimes(1)
    target.visibilityState = 'visible'
    fire('visibilitychange')
    expect(renew).toHaveBeenCalledTimes(2)
    await flush()
    stop()
    now += 60000
    fire('keydown')
    expect(renew).toHaveBeenCalledTimes(2)
  })
  it('coalesces pending requests and retries a transient failure on later input', async () => {
    const { target, fire } = fixture()
    let now = 0,
      reject!: (e: Error) => void
    const renew = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, no) => {
            reject = no
          }),
      )
      .mockResolvedValue(undefined)
    const stop = startSessionActivity(
      target as unknown as Document,
      target as unknown as Window,
      renew,
      () => now,
    )
    now += 60000
    fire('keydown')
    expect(renew).toHaveBeenCalledTimes(1)
    reject(new Error('offline'))
    await flush()
    now += 5000
    fire('keydown')
    expect(renew).toHaveBeenCalledTimes(2)
    stop()
  })
})
