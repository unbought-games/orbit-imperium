import type { Page, Response } from '@playwright/test'
import { withFixtureResponse } from './responses'
import { preparedEmpireIdentity } from './empire-identity'
import { binding } from '../../src/test-support/empire'
import type { ProfileAction } from '../../src/adapters/empire-history'
const archive = '/api/v4/empire-profiles/' + binding.player
const observations =
  '/api/v1/universes/' + binding.universe + '/player-profiles'
export const isCurrentObservation = (r: Response) =>
  r.request().method() === 'POST' &&
  new URL(r.url()).pathname === observations &&
  r.request().postDataJSON().source.type === 'SelfAccount'
export const loaded = (page: Page, action: () => Promise<unknown>) =>
  withFixtureResponse(
    page,
    (r) =>
      r.request().method() === 'GET' && new URL(r.url()).pathname === archive,
    action,
  )
export async function installObservedEmpire(page: Page) {
  const data = preparedEmpireIdentity()
  data.identity = {
    name: 'Roman Empire',
    tagline: 'Many worlds. One people.',
    title_id: 'consul',
  }
  data.title = {
    id: 'consul',
    label: 'Consul',
    address: 'Consul',
    expires_at: null,
  }
  const writes: ProfileAction[] = []
  await page.route(
    (u) => u.pathname === '/api/v1/session',
    (r) => {
      if (r.request().method() !== 'GET') return r.fallback()
      return r.fulfill({
        json: {
          account: binding.account,
          csrf: 'fixture',
          expires_at: Date.now() + 3600000,
          memberships: [],
        },
      })
    },
  )
  await page.route(
    (u) => u.pathname === archive,
    (r) => {
      if (
        r.request().method() === 'GET' &&
        new URL(r.request().url()).searchParams.get('library') === 'false'
      )
        return r.fulfill({ json: data })
      if (r.request().method() !== 'POST') return r.fallback()
      const req = r.request().postDataJSON()
      if (req.action?.type !== 'Identity') return r.fallback()
      if (req.expected_revision !== data.revision)
        return r.fulfill({ status: 409, json: { code: 'Conflict' } })
      writes.push(req.action)
      data.identity = req.action.identity
      data.revision++
      return r.fulfill({ json: { ok: true } })
    },
  )
  await page.route(
    (u) => u.pathname === observations,
    (r) => {
      if (r.request().method() !== 'POST') return r.fallback()
      const { context, source } = r.request().postDataJSON()
      if (
        source?.type !== 'SelfAccount' ||
        !context?.request_id ||
        Object.entries(binding).some(([k, v]) => context.binding?.[k] !== v)
      )
        return r.fallback()
      const observed_at = Math.floor(Date.now() / 1000)
      return r.fulfill({
        json: {
          ...context,
          players: [
            {
              player: binding.player,
              username: 'Aurelia',
              kind: 'human',
              observed_at,
              expires_at: observed_at + 300,
              identity: data.identity,
              title: data.title,
            },
          ],
        },
      })
    },
  )
  return { data, writes }
}
