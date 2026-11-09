import type { Page } from '@playwright/test'
import { withFixtureResponse } from './responses'

/** HTML load does not mean the lazy game route has requested its data yet.
 * Start content assertions after the Galaxy response, not while booting the app.
 * Keep the caller's DOM assertions: a successful response alone is not readiness.
 */
export function withGalaxyResponse(
  page: Page,
  navigate: () => Promise<unknown>,
) {
  return withFixtureResponse(
    page,
    (response) =>
      new URL(response.url()).pathname.endsWith('/world') &&
      response.request().method() === 'POST' &&
      response.request().postDataJSON().type === 'Galaxy',
    navigate,
  )
}
