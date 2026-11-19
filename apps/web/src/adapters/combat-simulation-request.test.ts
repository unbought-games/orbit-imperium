import { afterEach, expect, it, vi } from 'vitest'
import { gamePort } from './http'
import { readyFixture } from '../test-support/bootstrap'
import type { components } from '../contracts'

afterEach(() => vi.unstubAllGlobals())

it('sends only the bound query context and simulation inputs to the universe simulation endpoint', async () => {
  const { session, snapshot } = readyFixture(4)
  const context = {
    binding: snapshot.candidate.binding,
    request_id: snapshot.request_id,
  }
  const inputs: components['schemas']['SimulationInputs'] = {
    attacker: {
      technology: [9, 0, 0],
      units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
    },
    defender: { technology: [4, 0, 0], units: [] },
  }
  const response = {
    ...context,
    profile_hash: 'a'.repeat(64),
    loot_rules_enabled: true,
    samples: Array.from({ length: 10 }, () => ({
      outcome: 'AttackerVictory',
      rounds: 1,
      attacker: [],
      defender: [],
      debris: { metal: '0', crystal: '0', deuterium: '0' },
      surviving_cargo_capacity: '0',
      estimated_loot: null,
    })),
  }
  const fetch = vi.fn(
    async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify(response)),
  )
  vi.stubGlobal('fetch', fetch)
  const received = await gamePort(session.csrf, snapshot.candidate).simulate!(
    context,
    inputs,
  )
  expect(received.samples).toHaveLength(10)
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, options] = fetch.mock.calls[0]
  expect(url).toBe(
    `/api/v4/universes/${context.binding.universe}/combat-simulation`,
  )
  expect(options?.method).toBe('POST')
  expect(JSON.parse(String(options?.body))).toEqual({ context, inputs })
})
