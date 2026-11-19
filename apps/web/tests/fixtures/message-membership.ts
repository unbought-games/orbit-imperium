import type { Page } from '@playwright/test'
import { binding, matchesFixtureContext } from './game'

/** Messages queries the owner’s alliance to determine circular permissions. */
export function installEmptyMessageMembership(page: Page) {
  return page.route(
    (url) =>
      url.pathname === `/api/v4/universes/${binding.universe}/alliances/query`,
    (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      const { context, query } = r.request().postDataJSON()
      if (!matchesFixtureContext(context) || query?.type !== 'Mine')
        return r.fallback()
      return r.fulfill({
        json: {
          ...context,
          sampled_at: 1700000000000,
          directory: [],
          directory_count: 0,
          applications: [],
          alliance: null,
        },
      })
    },
  )
}
