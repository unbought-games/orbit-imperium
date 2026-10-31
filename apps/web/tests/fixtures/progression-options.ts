import type { components } from '../../src/contracts'
import type { Page, Route } from '@playwright/test'

type Handler = (route: Route) => unknown | Promise<unknown>
type Registration = { handler: Handler; remaining: number }
const handlers = new WeakMap<Page, Registration[]>()

/** Reuse item-specific fixture factories for the real single and bulk wire
 * contracts. All item resolution happens in memory; the browser makes one HTTP
 * request and receives one response. Fallback composes fixture overrides.
 */
export async function routeProgressionOptions(
  page: Page,
  handler: Handler,
  options?: { times?: number },
) {
  let stack = handlers.get(page)
  if (!stack) {
    stack = []
    handlers.set(page, stack)
    await page.route(/\/progression-options(?:\/bulk)?$/, async (route) => {
      const payload = route.request().postDataJSON()
      const requests = payload.requests ?? [payload.request]
      const factories = [...handlers.get(page)!].reverse()
      const used = new Set<Registration>()
      let failure: Parameters<Route['fulfill']>[0] | undefined
      let aborted: string | undefined
      let missing = false
      const options = await Promise.all(
        requests.map(async (request: unknown) => {
          let value: components['schemas']['GameProgressionOptions'] | undefined
          async function resolve(index: number): Promise<void> {
            const registration = factories[index]
            const factory = registration?.handler
            if (!factory) {
              missing = true
              return
            }
            const itemRoute = new Proxy(route, {
              get(target, property) {
                if (property === 'request')
                  return () =>
                    new Proxy(target.request(), {
                      get(original, name) {
                        if (name === 'postDataJSON')
                          return () => ({ context: payload.context, request })
                        const member = Reflect.get(original, name)
                        return typeof member === 'function'
                          ? member.bind(original)
                          : member
                      },
                    })
                if (property === 'fulfill')
                  return async (response: Parameters<Route['fulfill']>[0]) => {
                    if (response.status && response.status >= 400)
                      failure = response
                    else
                      value = response.json ?? JSON.parse(String(response.body))
                  }
                if (property === 'fallback') return () => resolve(index + 1)
                if (property === 'abort')
                  return async (reason = 'failed') => {
                    aborted = reason
                  }
                const member = Reflect.get(target, property)
                return typeof member === 'function'
                  ? member.bind(target)
                  : member
              },
            })
            if (!used.has(registration)) {
              used.add(registration)
              if (--registration.remaining === 0)
                handlers.set(
                  page,
                  handlers.get(page)!.filter((entry) => entry !== registration),
                )
            }
            await factory(itemRoute)
          }
          await resolve(0)
          return value
        }),
      )
      if (aborted) return route.abort(aborted)
      if (failure) return route.fulfill(failure)
      if (missing) return route.fallback()
      // Legacy item factories sample Date.now independently. A bulk service
      // reads once; publish one observation time for the assembled snapshot.
      const snapshot = options.map((option) => ({
        ...option,
        sampled_at: options[0]?.sampled_at,
        as_of_ms: options[0]?.as_of_ms,
      }))
      return route.fulfill({
        json: payload.requests ? { options: snapshot } : options[0],
      })
    })
  }
  stack.push({ handler, remaining: options?.times ?? Infinity })
}

export async function unrouteProgressionOptions(page: Page, handler: Handler) {
  const stack = handlers.get(page)
  if (stack)
    handlers.set(
      page,
      stack.filter((entry) => entry.handler !== handler),
    )
}
