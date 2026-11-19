import { afterEach, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { startAnalytics } from './adapters/optional-services'
import { loadInitialRuntime } from './adapters/runtime'
import { createAppRouter } from './router'
import { startGame } from './start-game'

vi.mock('react-dom/client', () => ({ createRoot: vi.fn() }))
vi.mock('./adapters/optional-services', () => ({ startAnalytics: vi.fn() }))
vi.mock('./adapters/runtime', async (original) => ({
  ...(await original<typeof import('./adapters/runtime')>()),
  browserDependencies: vi.fn(() => ({})),
  loadInitialRuntime: vi.fn(),
}))
vi.mock('./router', () => ({ createAppRouter: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('starts and renders the game router while optional analytics is still pending', async () => {
  vi.stubGlobal('document', {
    querySelectorAll: () => [],
    getElementById: () => ({}),
  })
  vi.stubGlobal('location', { pathname: '/u/andromeda' })
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0', platform: 'MacIntel' })
  const render = vi.fn()
  vi.mocked(createRoot).mockReturnValue({ render, unmount: vi.fn() })
  vi.mocked(loadInitialRuntime).mockResolvedValue({
    status: 'anonymous',
    signupEnabled: true,
  })
  let release!: () => void
  vi.mocked(startAnalytics).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  const starting = startGame()
  try {
    expect(startAnalytics).toHaveBeenCalledOnce()
    // This assertion runs before releasing analytics, so awaiting the optional
    // service before game bootstrap fails immediately.
    expect(loadInitialRuntime).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(createAppRouter).toHaveBeenCalledOnce()
    expect(render.mock.calls.at(-1)?.[0].props.initialRuntime).toEqual({
      status: 'anonymous',
      signupEnabled: true,
    })
  } finally {
    release()
    await starting
  }
})

it('starts the supporter preview directly without loading a game runtime or game router', async () => {
  vi.stubGlobal('document', {
    querySelectorAll: () => [],
    getElementById: () => ({}),
  })
  vi.stubGlobal('location', { pathname: '/supporter-preview' })
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0', platform: 'MacIntel' })
  const render = vi.fn()
  vi.mocked(createRoot).mockReturnValue({ render, unmount: vi.fn() })
  await startGame()
  const { SupporterPreview } = await import('./features/supporter-preview')
  expect(render).toHaveBeenCalledOnce()
  expect(render.mock.calls[0][0].type).toBe(SupporterPreview)
  expect(loadInitialRuntime).not.toHaveBeenCalled()
  expect(createAppRouter).not.toHaveBeenCalled()
})
