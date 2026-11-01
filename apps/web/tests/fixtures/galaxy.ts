import { expect, type Page } from '@playwright/test'

/** HTML load does not mean the lazy game route has requested its data yet.
 * Start content assertions after the Galaxy response, not while booting the app.
 * Keep the caller's DOM assertions: a successful response alone is not readiness.
 */
export async function withGalaxyResponse(
  page: Page,
  navigate: () => Promise<unknown>,
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith('/world') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().type === 'Galaxy',
    ),
    navigate(),
  ])
  expect(response.ok()).toBe(true)
  expect(await response.finished()).toBeNull()
}
