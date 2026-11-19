import type { Request, Route } from '@playwright/test'

/** Include operation discriminators without logging credentials, request IDs or payloads. */
function fixtureOperation(request: Request): string {
  const address = request.method() + ' ' + new URL(request.url()).pathname
  let payload
  try {
    payload = request.postDataJSON()
  } catch {
    return address + ' (invalid JSON)'
  }
  const command = payload?.gameplay?.command ?? payload?.command
  const types = Array.isArray(payload?.requests)
    ? payload.requests.map((item: { type?: unknown } | null) => item?.type)
    : [
        command?.action?.type ??
          command?.type ??
          payload?.query?.type ??
          payload?.request?.type ??
          payload?.action?.type ??
          payload?.source?.type ??
          payload?.type,
      ]
  const operations = [
    ...new Set(types.filter((type: unknown) => typeof type === 'string')),
  ]
  return operations.length
    ? address + ' (' + operations.join(', ') + ')'
    : address
}

/** Throw from the route callback so Playwright interrupts the active case,
 * including requests whose wrong URL or operation leaves a waiter pending. */
export function unexpectedFixtureApi(route: Route): never {
  throw new Error(
    'Unexpected fixture API operation: ' + fixtureOperation(route.request()),
  )
}
