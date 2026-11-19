import type { Page } from '@playwright/test'
import { binding } from '../../src/test-support/empire'
import { alliance, publicData, token } from './recruitment'

export const tokenReadPath = `/api/v4/universes/${binding.universe}/invitations/${token}`
export async function installPublicToken(page: Page) {
  const honorsPath = `/api/v1/rewards/alliances/${alliance}/honors`
  await page.route(
    (url) => url.pathname === tokenReadPath,
    (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({ json: publicData })
        : r.fallback(),
  )
  await page.route(
    (url) => url.pathname === honorsPath,
    (r) =>
      r.request().method() === 'GET'
        ? r.fulfill({ json: { alliance_id: alliance, honors: [] } })
        : r.fallback(),
  )
}
