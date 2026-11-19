import type { Page, Response } from '@playwright/test'
import { withFixtureResponse } from './responses'
import { preparedEmpireIdentity } from './empire-identity'
import { binding } from '../../src/test-support/empire'
import type { EmpireProfile } from '../../src/adapters/empire-history'
import type { components } from '../../src/contracts'
import { ContractDataError, validate } from '../../src/client-model/schema'
import { defaultTitle } from '../../src/client-model/empire-identity'
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
type ProfileCommand = components['schemas']['ProfileCommand']

export async function installIdentityArchive(page: Page, data: EmpireProfile) {
  const ownerPath = `/api/v4/empire-profiles/${data.player}`
  const writes: ProfileCommand[] = []
  await page.route(
    (url) => url.pathname === ownerPath,
    async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (request.method() === 'GET' && url.search === '?library=false')
        return route.fulfill({ json: data })
      if (
        request.method() !== 'POST' ||
        url.search ||
        request.headers()['x-csrf-token'] !== 'fixture'
      )
        return route.fallback()
      let command: ProfileCommand
      try {
        command = validate<ProfileCommand>(
          'ProfileCommand',
          request.postDataJSON(),
        )
      } catch (error) {
        if (error instanceof ContractDataError) return route.fallback()
        throw error
      }
      if (command.action.type !== 'Identity') return route.fallback()
      if (command.expected_revision !== data.revision)
        return route.fulfill({ status: 409, json: { code: 'Conflict' } })
      writes.push(command)
      data.identity = command.action.identity
      const selected = data.title_choices?.find(
        (choice) => choice.title.id === data.identity?.title_id,
      )
      if (selected?.availability === 'available') {
        const { id, label, address } = selected.title
        data.title = { id, label, address, expires_at: null }
      } else data.title = defaultTitle
      data.revision++
      return route.fulfill({ json: { ok: true } })
    },
  )
  return writes
}

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
  const writes = await installIdentityArchive(page, data)
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
