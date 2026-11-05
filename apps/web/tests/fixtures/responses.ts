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
 * response policy. The listener lives with the Page; no polling or sleeps. */
export function trackFixtureResponses(
  page: Page,
  matches: (request: Request) => boolean,
) {
  const pending = new Set<Promise<unknown>>()
  page.on('request', (request) => {
    if (!matches(request)) return
    const delivered = request
      .response()
      .then((response) => response?.finished())
      .finally(() => pending.delete(delivered))
    pending.add(delivered)
  })
  return async () => {
    while (pending.size) await Promise.all([...pending])
  }
}
