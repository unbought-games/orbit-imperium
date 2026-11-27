import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { startOrbGlitches, type OrbGlitch } from './orb-glitch'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it.each([0, 0.99999])(
  'times the first and recurring bursts at random draw %s',
  (draw) => {
    vi.spyOn(Math, 'random').mockReturnValue(draw)
    const show = vi.fn()
    const stop = startOrbGlitches(show)
    const first = draw === 0 ? 1450 : 1849
    const rest = draw === 0 ? 12000 : 27999
    vi.advanceTimersByTime(first - 1)
    expect(show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(show).toHaveBeenCalledTimes(1)
    expect(show.mock.lastCall?.[0]).toBeTruthy()
    vi.advanceTimersByTime(1200)
    expect(show).toHaveBeenLastCalledWith(null)
    vi.advanceTimersByTime(rest - 1)
    expect(show).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    expect(show).toHaveBeenCalledTimes(3)
    stop()
    vi.runAllTimers()
    expect(show).toHaveBeenCalledTimes(3)
  },
)

it('plays all four faults per cycle without repeating across the boundary', () => {
  const draws = [0.01, 0.78, 0.3, 0.99]
  let i = 0
  vi.spyOn(Math, 'random').mockImplementation(() => draws[i++ % draws.length])
  const faults: OrbGlitch[] = []
  const stop = startOrbGlitches((effect) => {
    if (effect) faults.push(effect)
  })
  for (let tick = 0; tick < 15; tick++) vi.advanceTimersToNextTimer()
  stop()
  for (const start of [0, 4])
    expect(faults.slice(start, start + 4).sort()).toEqual([
      'chroma',
      'collapse',
      'roll',
      'tear',
    ])
  expect(faults[3]).not.toEqual(faults[4])
})
