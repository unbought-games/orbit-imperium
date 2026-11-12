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
  const response = await deliveredFixtureResponse(page, matches, navigate)
  expect(response?.ok()).toBe(true)
}

/** Intentional error states still need complete delivery before changing scenarios. */
export async function withFixtureResponseStatus(
  page: Page,
  matches: (response: Response) => boolean,
  navigate: () => Promise<unknown>,
  status: number,
) {
  const response = await deliveredFixtureResponse(page, matches, navigate)
  expect(response?.status()).toBe(status)
}

async function deliveredFixtureResponse(
  page: Page,
  matches: (response: Response) => boolean,
  navigate: () => Promise<unknown>,
) {
  // A matching response from the page being replaced can be cancelled by the
  // navigation; only a delivered body ('requestfinished') is the boundary.
  const [request] = await Promise.all([
    page.waitForEvent('requestfinished', {
      predicate: async (request) => {
        const response = await request.response()
        return response !== null && matches(response)
      },
    }),
    navigate(),
  ])
  return request.response()
}

const posted = (response: Response, path: string) =>
  response.request().method() === 'POST' &&
  new URL(response.url()).pathname.endsWith(path)

/** Direct loads take their initial game snapshot from bootstrap, not /overview. */
export function withBootstrapResponse(
  page: Page,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) => new URL(response.url()).pathname === '/api/v1/bootstrap',
    navigate,
  )
}

/** The report list, not the shell's unread-only badge query. */
export function withReportListResponse(
  page: Page,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) =>
      posted(response, '/reports') &&
      response.request().postDataJSON().filter?.unread_only === false,
    navigate,
  )
}

export function withReportResponse(
  page: Page,
  report: string,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) => posted(response, `/reports/${report}`),
    navigate,
  )
}

export function withSharedReportResponse(
  page: Page,
  token: string,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) =>
      new URL(response.url()).pathname === `/api/v4/shared-reports/${token}`,
    navigate,
  )
}

export function withRankingsResponse(
  page: Page,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) => posted(response, '/rankings'),
    navigate,
  )
}

export function withSocialResponse(
  page: Page,
  type: 'Conversations' | 'Messages',
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) =>
      posted(response, '/social/query') &&
      response.request().postDataJSON().query.type === type,
    navigate,
  )
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
