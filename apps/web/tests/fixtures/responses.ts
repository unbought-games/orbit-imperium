import {
  expect,
  type Page,
  type Response,
  type Request,
} from '@playwright/test'
import type { components } from '../../src/contracts'

/** Subscribe before starting navigation. HTTP success and complete delivery
 * establish the data boundary; callers must still assert rendered UI state.
 * Do not use this for intentional loading, error, or held-response scenarios.
 */
export async function withFixtureResponse(
  page: Page,
  matches: (response: Response) => boolean,
  navigate: () => Promise<unknown>,
) {
  const [response] = await Promise.all([
    page.waitForResponse(matches),
    navigate(),
  ])
  expect(response.ok()).toBe(true)
  expect(await response.finished()).toBeNull()
}

export function withProgressionResponse(
  page: Page,
  matches: (request: components['schemas']['QuoteRequest3']) => boolean,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) => {
      if (
        response.request().method() !== 'POST' ||
        !/\/progression-options(?:\/bulk)?$/.test(
          new URL(response.url()).pathname,
        )
      )
        return false
      const payload = response.request().postDataJSON()
      return (payload.requests ?? [payload.request]).some(matches)
    },
    navigate,
  )
}

/** Drain requests chosen by the previous fixture phase before changing its
 * response policy. Terminal request events include complete body delivery (or
 * intentional failure), without creating response promises during teardown.
 * Callers still validate expected HTTP outcomes and rendered state separately. */
export function trackFixtureResponses(
  page: Page,
  matches: (request: Request) => boolean,
) {
  const pending = new Set<Request>()
  const waiters = new Set<{
    resolve: () => void
    reject: (error: Error) => void
  }>()
  let closed = false
  const closedError = () =>
    new Error('Fixture page closed before requests settled')
  const started = (request: Request) => {
    if (matches(request)) pending.add(request)
  }
  const finished = (request: Request) => {
    pending.delete(request)
    if (pending.size) return
    for (const waiter of waiters) waiter.resolve()
    waiters.clear()
  }
  page.on('request', started)
  page.on('requestfinished', finished)
  page.on('requestfailed', finished)
  page.once('close', () => {
    closed = true
    page.off('request', started)
    page.off('requestfinished', finished)
    page.off('requestfailed', finished)
    pending.clear()
    for (const waiter of waiters) waiter.reject(closedError())
    waiters.clear()
  })
  return async () => {
    if (closed) throw closedError()
    while (pending.size) {
      await new Promise<void>((resolve, reject) =>
        waiters.add({ resolve, reject }),
      )
    }
  }
}
