import type { Page } from '@playwright/test'
import type { EmpireProfile } from '../../src/adapters/empire-history'
import { binding, id } from './game'

export async function installEmpireIdentityFixture(page: Page) {
  const profile: EmpireProfile = {
    player: binding.player,
    profile: id(80),
    universe: binding.universe,
    epoch: binding.epoch,
    universe_name: 'Andromeda',
    username: 'Aurelia',
    display: null,
    owner: true,
    public: false,
    removed: false,
    closed: false,
    revision: 0,
    entries: [],
    next: null,
    identity: {
      name: 'Aurelian Commonwealth',
      tagline: 'Many worlds. One horizon.',
      title_id: 'commander',
    },
    title: {
      id: 'commander',
      label: 'Commander',
      address: 'Commander',
      expires_at: null,
    },
    title_choices: [
      'Commander',
      'Captain',
      'Admiral',
      'Consul',
      'Navigator',
      'Explorer',
    ].map((label) => ({
      title: {
        id: label.toLowerCase(),
        label,
        address: label,
        access: 'free' as const,
      },
      availability: 'available' as const,
    })),
  }
  const writes: unknown[] = []
  await page.route('**/api/v4/empire-profiles/**', async (route) => {
    if (route.request().method() === 'POST') {
      const request = route.request().postDataJSON()
      writes.push(request)
      if (request.expected_revision !== profile.revision)
        return route.fulfill({ status: 409, json: { code: 'Conflict' } })
      profile.identity = request.action.identity
      const title = profile.title_choices!.find(
        (c) => c.title.id === profile.identity!.title_id,
      )!.title
      profile.title = {
        id: title.id,
        label: title.label,
        address: title.address,
        expires_at: null,
      }
      profile.revision++
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: profile })
  })
  return { profile, writes }
}
