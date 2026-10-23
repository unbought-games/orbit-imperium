type Analytics = typeof import('./analytics')

let analytics: Analytics | undefined
let startup: Promise<void> | undefined

// Keep the SDK and its module graph outside the game's required imports. A
// content blocker may reject the script itself, before any SDK code can run.
export function startAnalytics(): Promise<void> {
  return (startup ??= import('./analytics')
    .then((module) => {
      analytics = module
      return module.startAnalytics()
    })
    .catch(() => {}))
}

export function bindAnalytics(): void {
  try {
    void analytics?.bindAnalytics().catch(() => {})
  } catch {
    // Optional telemetry must never interrupt enrollment.
  }
}

export function resetAnalytics(): void {
  try {
    analytics?.resetAnalytics()
  } catch {
    // Signing out must work even when the SDK fails.
  }
}
