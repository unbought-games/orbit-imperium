import { commandId } from './command-id'
import routes from '../analytics-routes.json'
import {
  init,
  takeHandoff,
  linkJourneys,
  type AnalyticsClient,
} from '@unbought/analytics'
let client: AnalyticsClient | undefined
let ready: Promise<void> | undefined
let active: Promise<void> | undefined
let boundVisit: string | undefined
const boundary = 'orbit.analytics.account-boundary.v1'

function disabled() {
  try {
    return localStorage.getItem('orbit.analytics.disabled') === 'true'
  } catch {
    return false
  }
}
async function status() {
  const response = await fetch('/api/analytics', {
    cache: 'no-store',
    signal: AbortSignal.timeout(2000),
  })
  if (!response.ok) throw new Error('Analytics unavailable')
  return response.json()
}
async function post(action: string, extra = {}, csrf?: string) {
  if (!client) return null
  const { visit_id, visitor_id, touch_id } = client.getJourneyContext()
  const journey = { visit_id, visitor_id, touch_id }
  if (!journey.visit_id || !journey.visitor_id) return null
  const response = await fetch('/api/analytics', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: JSON.stringify({ action, journey, ...extra }),
    signal: AbortSignal.timeout(4000),
  })
  if (!response.ok) throw new Error('Analytics unavailable')
  return response.json()
}
export function startAnalytics() {
  if (ready) return ready
  ready = (async () => {
    const handoff = takeHandoff()
    if (
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl ||
      navigator.doNotTrack === '1'
    )
      return
    const state = await status()
    if (!state.enabled) return
    client = init({
      ...state.config,
      routes,
      profile: 'identified',
      initialPageView: false,
      respectPreferenceSignals: true,
      choice: {
        enabled: !disabled(),
        crossProperty: true,
        persistentAttribution: true,
      },
      redeemBridge: async (request) => {
        await post('redeem', { handoff: request.handoff })
      },
    })
    // Clear an old account's queued startup view before policy readiness can send it.
    try {
      const previous = localStorage.getItem(boundary)
      if (previous && previous !== state.accountKey) client.reset()
    } catch {
      /* Storage may be unavailable; the SDK falls back to memory. */
    }
    await client.ready
    if (handoff) await client.redeemHandoff(handoff).catch(() => {})
    linkJourneys(client, Object.keys(state.config.handoffOrigins))
    ;(window as Window & { orbitAnalytics?: unknown }).orbitAnalytics = {
      disable: disableAnalytics,
      coverage: () => client?.getCoverage(),
    }
    let attempts = 0
    const retry = setInterval(() => {
      if (++attempts >= 5) clearInterval(retry)
      void bindAnalytics()
    }, 15000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void bindAnalytics()
    })
    await bindAnalytics()
  })().catch(() => {})
  return ready
}
export function bindAnalytics() {
  if (active) return active
  active = (async () => {
    if (!client) return
    const state = await status()
    let previous: string | null = null
    try {
      previous = localStorage.getItem(boundary)
    } catch {
      /* Storage may be unavailable; the SDK falls back to memory. */
    }
    if (previous && previous !== state.accountKey) {
      client.reset()
      boundVisit = undefined
    }
    try {
      if (state.accountKey) localStorage.setItem(boundary, state.accountKey)
      else localStorage.removeItem(boundary)
    } catch {
      /* Storage may be unavailable; the SDK falls back to memory. */
    }
    if (!state.accountKey || boundVisit === client.getJourneyContext().visit_id)
      return
    const response = await fetch('/api/v1/session', {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) return
    const session = await response.json()
    await client.flush()
    const result = await post('identify', {}, session.csrf)
    if (result?.proof) {
      await client.identify(result.proof)
      boundVisit = client.getJourneyContext().visit_id ?? undefined
    }
  })()
    .catch(() => {})
    .finally(() => {
      active = undefined
    })
  return active
}
export function resetAnalytics() {
  client?.reset()
  boundVisit = undefined
  try {
    localStorage.removeItem(boundary)
  } catch {
    /* Storage may be unavailable; the SDK falls back to memory. */
  }
}
export function disableAnalytics(disable: boolean) {
  document.cookie = `orbit_analytics_epoch=${commandId(crypto)}; Path=/; SameSite=Lax; Max-Age=31536000`
  document.cookie = `orbit_analytics_disabled=${disable}; Path=/; SameSite=Lax; Max-Age=31536000${location.protocol === 'https:' ? '; Secure' : ''}`
  try {
    localStorage.setItem('orbit.analytics.disabled', String(disable))
  } catch {
    /* Storage may be unavailable; the SDK falls back to memory. */
  }
  client?.setCollectionChoice({
    enabled: !disable,
    crossProperty: !disable,
    persistentAttribution: !disable,
  })
  boundVisit = undefined
}

export function trackRecruitment(action: 'enrolled' | 'applied' | 'joined') {
  // Aggregate journey stages only: never send invitation tokens, application
  // text, or the manager who created a reusable alliance link.
  client?.track(`alliance_recruitment_${action}`)
}
