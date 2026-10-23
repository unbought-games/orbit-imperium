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
let accountsOrigin: string | undefined
let navigatingToLogin = false
const boundary = 'orbit.analytics.account-boundary.v1'
const routes = [
  '/',
  '/login',
  '/signup',
  '/updates/:article',
  '/u/:universe',
  '/u/:universe/overview',
  '/u/:universe/settings',
  '/u/:universe/research',
  '/u/:universe/galaxy',
  '/u/:universe/dispatch',
  '/u/:universe/fleets',
  '/u/:universe/fleets/:item',
  '/u/:universe/reports',
  '/u/:universe/reports/:item',
  '/u/:universe/b/:body/overview',
  '/u/:universe/b/:body/resources',
  '/u/:universe/b/:body/facilities',
  '/u/:universe/b/:body/shipyard',
  '/u/:universe/b/:body/defense',
]
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
    const auth = await fetch('/api/auth/config')
      .then((r) => r.json())
      .catch(() => ({}))
    accountsOrigin = auth.accounts_url
      ? new URL(auth.accounts_url).origin
      : undefined
    client = init({
      ...state.config,
      routes,
      profile: 'identified',
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
    document.addEventListener('click', (event) => {
      if (
        event.defaultPrevented ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return
      const link = event
        .composedPath()
        .find((el) => el instanceof HTMLAnchorElement) as
        | HTMLAnchorElement
        | undefined
      if (!link || (link.target && link.target !== '_self') || link.download)
        return
      const url = new URL(link.href)
      if (url.origin !== location.origin || url.pathname !== '/api/auth/login')
        return
      event.preventDefault()
      if (navigatingToLogin) return
      navigatingToLogin = true
      void prepareLogin(url).then((target) => location.assign(target))
    })
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
async function prepareLogin(url: URL): Promise<string> {
  if (!client || !accountsOrigin) return url.href
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  try {
    return await Promise.race([
      (async () => {
        const handoff = await client!.createHandoff(accountsOrigin!)
        if (controller.signal.aborted) return url.href
        const response = await fetch('/api/auth/login-journey', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handoff,
            return_to: url.searchParams.get('return_to'),
            verify: url.searchParams.get('verify') === 'true',
          }),
          signal: controller.signal,
        })
        if (!response.ok) return url.href
        const result = await response.json()
        const target = new URL(result.url)
        return target.origin === accountsOrigin ? target.href : url.href
      })(),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => {
          controller.abort()
          resolve(url.href)
        }, 1500)
      }),
    ])
  } catch {
    return url.href
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
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
